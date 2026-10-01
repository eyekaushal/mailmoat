// Developer CLI: backfill on first run, then poll Gmail every 60 s and run each new email through
// the security pipeline (labels are applied in Gmail). Usage (repo root): npm run dev:sync
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { AuditLog } from '../src/audit/AuditLog.js';
import { Config } from '../src/config/Config.js';
import { KeyProvider } from '../src/config/KeyProvider.js';
import { SecretStore } from '../src/config/SecretStore.js';
import { Logger } from '../src/core/Logger.js';
import { Scheduler } from '../src/core/Scheduler.js';
import { Database } from '../src/db/Database.js';
import { Migrator } from '../src/db/Migrator.js';
import { AuditLogRepository } from '../src/db/repositories/AuditLogRepository.js';
import { ContactRepository } from '../src/db/repositories/ContactRepository.js';
import { EmailRepository } from '../src/db/repositories/EmailRepository.js';
import { SenderRepository } from '../src/db/repositories/SenderRepository.js';
import { SettingsRepository } from '../src/db/repositories/SettingsRepository.js';
import { SyncStateRepository } from '../src/db/repositories/SyncStateRepository.js';
import { VerdictRepository } from '../src/db/repositories/VerdictRepository.js';
import { GmailClient } from '../src/google/GmailClient.js';
import { GoogleAuth } from '../src/google/GoogleAuth.js';
import { LlmClient } from '../src/llm/LlmClient.js';
import { ModelConfig } from '../src/llm/ModelConfig.js';
import { SecurityPipeline } from '../src/security/SecurityPipeline.js';
import { AuthResultsParser } from '../src/security/ingest/AuthResultsParser.js';
import { EmailIngestor } from '../src/security/ingest/EmailIngestor.js';
import { HiddenContentDetector } from '../src/security/ingest/HiddenContentDetector.js';
import { LinkExtractor } from '../src/security/ingest/LinkExtractor.js';
import { MimeParser } from '../src/security/ingest/MimeParser.js';
import { TextNormalizer } from '../src/security/ingest/TextNormalizer.js';
import { Reader } from '../src/security/reader/Reader.js';
import { RiskEngine } from '../src/security/risk/RiskEngine.js';
import { RiskRules } from '../src/security/risk/RiskRules.js';
import { SignalCatalog } from '../src/security/signals/SignalCatalog.js';
import { SignalEngine } from '../src/security/signals/SignalEngine.js';
import { Backfill } from '../src/sync/Backfill.js';
import { ContactHistoryBuilder } from '../src/sync/ContactHistoryBuilder.js';
import { EmailMetadataMapper } from '../src/sync/EmailMetadataMapper.js';
import { GmailSync } from '../src/sync/GmailSync.js';
import { MessageImporter } from '../src/sync/MessageImporter.js';

const POLL_MS = 60_000;

const config = new Config(process.env);
const logger = new Logger({ level: config.logLevel });
const db = new Database(config.databasePath);
new Migrator(db).migrate();

const settings = new SettingsRepository(db);
const googleAuth = new GoogleAuth({
  ...config.googleClient,
  redirectUri: `http://${config.host}:${config.port}/api/google/callback`,
  secretStore: new SecretStore(db, new KeyProvider(join(config.dataDir, 'master.key'))),
  settings,
});
if (!googleAuth.isConnected()) {
  console.error('No Google account connected. Run: npm run connect:google');
  process.exit(1);
}
if (!config.anthropicApiKey) {
  console.error('ANTHROPIC_API_KEY is not set (add it to .env).');
  process.exit(1);
}

const gmail = new GmailClient(googleAuth);
const emails = new EmailRepository(db);
const contacts = new ContactRepository(db);
const importer = new MessageImporter({
  gmail,
  emails,
  history: new ContactHistoryBuilder(contacts, new SenderRepository(db), () =>
    googleAuth.connectedEmail(),
  ),
  mapper: new EmailMetadataMapper(),
  logger,
});
const auditLog = new AuditLog(new AuditLogRepository(db));
const models = new ModelConfig();
const pipeline = new SecurityPipeline({
  gmail,
  ingestor: new EmailIngestor({
    mimeParser: new MimeParser(),
    authResultsParser: new AuthResultsParser(),
    linkExtractor: new LinkExtractor(),
    hiddenContentDetector: new HiddenContentDetector(),
    textNormalizer: new TextNormalizer(),
  }),
  reader: new Reader({
    llm: new LlmClient({
      anthropic: new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 3, timeout: 60_000 }),
      models,
      auditLog,
      logger,
    }),
    logger,
  }),
  signalEngine: new SignalEngine({ signals: new SignalCatalog().create(), logger }),
  riskEngine: new RiskEngine(new RiskRules()),
  contacts,
  verdicts: new VerdictRepository(db),
  settings,
  auditLog,
  readerModel: models.forRole('reader').model,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  logger,
});
// Prints only the sender domain and verdict: subjects and bodies stay out of the terminal log.
const printingProcessor = {
  async process(record) {
    const { verdict } = await pipeline.process(record);
    const arrow = record.direction === 'inbound' ? '←' : '→';
    const level = verdict ? `${verdict.level} (${verdict.score})` : 'read';
    console.log(
      `${new Date().toLocaleTimeString()}  ${arrow} @${record.fromDomain} (${record.gmailId}): ${level}`,
    );
    for (const reason of verdict?.topReasons() ?? []) console.log(`      - ${reason}`);
  },
};
const sync = new GmailSync({
  gmail,
  importer,
  emails,
  syncState: new SyncStateRepository(db),
  processor: printingProcessor,
  logger,
});

const { firstRun, startedAt } = await sync.initialize();
if (firstRun) {
  console.log('First run: importing mail metadata (sent: 365 days, received: 30 days)…');
  await new Backfill({ gmail, importer, logger }).run({
    before: startedAt,
    onProgress: ({ phase, stored }) => process.stdout.write(`\r  ${phase}: ${stored} stored   `),
  });
  console.log(`\n✓ Backfill done — ${emails.count()} emails stored`);
}

console.log(
  `Watching ${googleAuth.connectedEmail()} — polling every ${POLL_MS / 1000} s (Ctrl+C to stop)`,
);
const scheduler = new Scheduler(logger).every('gmail-sync', POLL_MS, () => sync.poll());
scheduler.start();
process.on('SIGINT', () => {
  scheduler.stop();
  db.close();
  process.exit(0);
});

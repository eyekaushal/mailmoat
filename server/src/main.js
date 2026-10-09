// Composition root: every object is wired here, once, then the API server starts on loopback.
// Usage (repo root): npm start
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionExecutor } from './actions/ActionExecutor.js';
import { ApprovalService } from './actions/ApprovalService.js';
import { PlanInterpreter } from './agent/PlanInterpreter.js';
import { Planner } from './agent/Planner.js';
import { ApplyLabelTool } from './agent/tools/ApplyLabelTool.js';
import { ArchiveTool } from './agent/tools/ArchiveTool.js';
import { BlockSenderTool } from './agent/tools/BlockSenderTool.js';
import { CreateCalendarEventTool } from './agent/tools/CreateCalendarEventTool.js';
import { CreateDraftTool } from './agent/tools/CreateDraftTool.js';
import { ExtractTool } from './agent/tools/ExtractTool.js';
import { GetEmailFieldsTool } from './agent/tools/GetEmailFieldsTool.js';
import { GetFreeBusyTool } from './agent/tools/GetFreeBusyTool.js';
import { MarkReadTool } from './agent/tools/MarkReadTool.js';
import { ReplyTool } from './agent/tools/ReplyTool.js';
import { SaveMemoryTool } from './agent/tools/SaveMemoryTool.js';
import { SearchEmailsTool } from './agent/tools/SearchEmailsTool.js';
import { SendEmailTool } from './agent/tools/SendEmailTool.js';
import { SummariseTool } from './agent/tools/SummariseTool.js';
import { ToolRegistry } from './agent/tools/ToolRegistry.js';
import { UnsubscribeTool } from './agent/tools/UnsubscribeTool.js';
import { App } from './api/App.js';
import { SecurityMiddleware } from './api/SecurityMiddleware.js';
import { ApprovalRoutes } from './api/routes/ApprovalRoutes.js';
import { ChatRoutes } from './api/routes/ChatRoutes.js';
import { EmailRoutes } from './api/routes/EmailRoutes.js';
import { GoogleRoutes } from './api/routes/GoogleRoutes.js';
import { RuleRoutes } from './api/routes/RuleRoutes.js';
import { SearchRoutes } from './api/routes/SearchRoutes.js';
import { SecurityRoutes } from './api/routes/SecurityRoutes.js';
import { SenderRoutes } from './api/routes/SenderRoutes.js';
import { SettingsRoutes } from './api/routes/SettingsRoutes.js';
import { SummaryRoutes } from './api/routes/SummaryRoutes.js';
import { SystemRoutes } from './api/routes/SystemRoutes.js';
import { ThreadRoutes } from './api/routes/ThreadRoutes.js';
import { AuditLog } from './audit/AuditLog.js';
import { Config } from './config/Config.js';
import { KeyProvider } from './config/KeyProvider.js';
import { SecretStore } from './config/SecretStore.js';
import { LocalData } from './core/LocalData.js';
import { Logger } from './core/Logger.js';
import { Scheduler } from './core/Scheduler.js';
import { Database } from './db/Database.js';
import { Migrator } from './db/Migrator.js';
import { ApprovalRepository } from './db/repositories/ApprovalRepository.js';
import { AuditLogRepository } from './db/repositories/AuditLogRepository.js';
import { ChatRepository } from './db/repositories/ChatRepository.js';
import { ContactRepository } from './db/repositories/ContactRepository.js';
import { DraftRepository } from './db/repositories/DraftRepository.js';
import { EmailRepository } from './db/repositories/EmailRepository.js';
import { MemoryRepository } from './db/repositories/MemoryRepository.js';
import { RuleRepository } from './db/repositories/RuleRepository.js';
import { SenderRepository } from './db/repositories/SenderRepository.js';
import { SettingsRepository } from './db/repositories/SettingsRepository.js';
import { SyncStateRepository } from './db/repositories/SyncStateRepository.js';
import { VerdictRepository } from './db/repositories/VerdictRepository.js';
import { ChatService } from './features/ChatService.js';
import { DraftService } from './features/DraftService.js';
import { MeetingService } from './features/MeetingService.js';
import { SafeHttpClient } from './features/SafeHttpClient.js';
import { SummaryService } from './features/SummaryService.js';
import { UnsubscribeService } from './features/UnsubscribeService.js';
import { CalendarClient } from './google/CalendarClient.js';
import { GmailClient } from './google/GmailClient.js';
import { GoogleAuth } from './google/GoogleAuth.js';
import { AnthropicProvider } from './llm/AnthropicProvider.js';
import { LlmClient } from './llm/LlmClient.js';
import { ModelConfig } from './llm/ModelConfig.js';
import { PolicyEngine } from './policy/PolicyEngine.js';
import { BlockRule } from './policy/rules/BlockRule.js';
import { CalendarRule } from './policy/rules/CalendarRule.js';
import { DraftRule } from './policy/rules/DraftRule.js';
import { MemoryRule } from './policy/rules/MemoryRule.js';
import { OrganizeRule } from './policy/rules/OrganizeRule.js';
import { ReadRule } from './policy/rules/ReadRule.js';
import { SendRule } from './policy/rules/SendRule.js';
import { UnsubscribeRule } from './policy/rules/UnsubscribeRule.js';
import { BlockedSenderFilter } from './rules/BlockedSenderFilter.js';
import { PredefinedRules } from './rules/PredefinedRules.js';
import { RuleEngine } from './rules/RuleEngine.js';
import { SecurityPipeline } from './security/SecurityPipeline.js';
import { AuthResultsParser } from './security/ingest/AuthResultsParser.js';
import { EmailIngestor } from './security/ingest/EmailIngestor.js';
import { HiddenContentDetector } from './security/ingest/HiddenContentDetector.js';
import { LinkExtractor } from './security/ingest/LinkExtractor.js';
import { MimeParser } from './security/ingest/MimeParser.js';
import { TextNormalizer } from './security/ingest/TextNormalizer.js';
import { Drafter } from './security/reader/Drafter.js';
import { Extractor } from './security/reader/Extractor.js';
import { Reader } from './security/reader/Reader.js';
import { RiskEngine } from './security/risk/RiskEngine.js';
import { RiskRules } from './security/risk/RiskRules.js';
import { SignalCatalog } from './security/signals/SignalCatalog.js';
import { SignalEngine } from './security/signals/SignalEngine.js';
import { Backfill } from './sync/Backfill.js';
import { ContactHistoryBuilder } from './sync/ContactHistoryBuilder.js';
import { EmailMetadataMapper } from './sync/EmailMetadataMapper.js';
import { GmailSync } from './sync/GmailSync.js';
import { MessageImporter } from './sync/MessageImporter.js';

const { version } = createRequire(import.meta.url)('../package.json');
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

// --- Core -------------------------------------------------------------------------------------
const config = new Config(process.env);
const logger = new Logger({ level: config.logLevel });
const db = new Database(config.databasePath);
new Migrator(db).migrate();
const keyPath = join(config.dataDir, 'master.key');
const secretStore = new SecretStore(db, new KeyProvider(keyPath));
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const settings = new SettingsRepository(db);
const emails = new EmailRepository(db);
const verdicts = new VerdictRepository(db);
const contacts = new ContactRepository(db);
const senders = new SenderRepository(db);
const ruleRepository = new RuleRepository(db);
const auditRepository = new AuditLogRepository(db);
const auditLog = new AuditLog(auditRepository);
const syncState = new SyncStateRepository(db);

// --- Google -----------------------------------------------------------------------------------
const googleAuth = new GoogleAuth({
  ...(config.googleClient ?? { clientId: '', clientSecret: '' }),
  redirectUri: `http://${config.host}:${config.port}/api/google/callback`,
  secretStore,
  settings,
});
const gmail = new GmailClient(googleAuth);
const calendar = new CalendarClient(googleAuth);
const userEmail = () => googleAuth.connectedEmail();

// --- LLM --------------------------------------------------------------------------------------
const anthropic = new AnthropicProvider({ secretStore, envKey: config.anthropicApiKey });
const models = new ModelConfig({
  plannerModel: settings.get('plannerModel'),
  drafterModel: settings.get('drafterModel'),
});
const llm = new LlmClient({ anthropic, models, auditLog, logger });

// --- Security pipeline ------------------------------------------------------------------------
const textNormalizer = new TextNormalizer();
const ingestor = new EmailIngestor({
  mimeParser: new MimeParser(),
  authResultsParser: new AuthResultsParser(),
  linkExtractor: new LinkExtractor(),
  hiddenContentDetector: new HiddenContentDetector(),
  textNormalizer,
});
const pipeline = new SecurityPipeline({
  gmail,
  ingestor,
  reader: new Reader({ llm, logger }),
  signalEngine: new SignalEngine({ signals: new SignalCatalog().create(), logger }),
  riskEngine: new RiskEngine(new RiskRules()),
  contacts,
  verdicts,
  settings,
  auditLog,
  readerModel: models.forRole('reader').model,
  timeZone,
  logger,
});

// --- Agent, policy, actions -------------------------------------------------------------------
const policy = new PolicyEngine({
  rules: [
    new ReadRule(),
    new OrganizeRule(),
    new DraftRule(),
    new SendRule(),
    new CalendarRule(),
    new UnsubscribeRule({ emails, verdicts }),
    new BlockRule(),
    new MemoryRule(),
  ],
  emails,
  verdicts,
  logger,
});
const drafts = new DraftService({
  gmail,
  ingestor,
  drafter: new Drafter({ llm }),
  emails,
  verdicts,
  repository: new DraftRepository(db),
  settings,
  auditLog,
  logger,
});
// The registry needs UnsubscribeService and vice versa (the tool calls it; it runs through the
// executor), so the service gets the executor and approvals after they exist.
const lateDeps = {};
const registry = new ToolRegistry([
  new SearchEmailsTool({ emails, verdicts }),
  new GetEmailFieldsTool({ emails, verdicts }),
  new ExtractTool({ extractor: new Extractor({ llm }) }),
  new SummariseTool({ emails, verdicts }),
  new ApplyLabelTool({ gmail }),
  new ArchiveTool({ gmail }),
  new MarkReadTool({ gmail }),
  new CreateDraftTool({ gmail }),
  new SendEmailTool({ gmail, drafts }),
  new ReplyTool({ emails, drafts }),
  new GetFreeBusyTool({ calendar }),
  new CreateCalendarEventTool({ calendar }),
  new UnsubscribeTool({
    unsubscribes: { unsubscribe: (address) => lateDeps.unsubscribes.unsubscribe(address) },
  }),
  new BlockSenderTool({ senders }),
  new SaveMemoryTool({ memory: new MemoryRepository(db) }),
]);
const executor = new ActionExecutor({ registry, auditLog });
const approvals = new ApprovalService({
  approvals: new ApprovalRepository(db),
  registry,
  policy,
  executor,
  auditLog,
});
const interpreter = new PlanInterpreter({
  registry,
  policy,
  executor,
  approvals,
  auditLog,
  logger,
});
const planner = new Planner({ llm, tools: registry.catalogue(), auditLog, logger });

// --- Features ---------------------------------------------------------------------------------
const predefined = new PredefinedRules();
const ruleEngine = new RuleEngine({
  pipeline,
  blocked: new BlockedSenderFilter({ senders, gmail, auditLog }),
  rules: predefined,
  repository: ruleRepository,
  emails,
  verdicts,
  policy,
  executor,
  drafts,
  settings,
  auditLog,
  logger,
  timeZone,
});
const unsubscribes = new UnsubscribeService({
  http: new SafeHttpClient(),
  emails,
  verdicts,
  senders,
  gmail,
  policy,
  executor,
  approvals,
  auditLog,
  logger,
  timeZone,
});
lateDeps.unsubscribes = unsubscribes;
const chats = new ChatService({
  planner,
  interpreter,
  approvals,
  emails,
  verdicts,
  gmail,
  ingestor,
  repository: new ChatRepository(db),
  auditLog,
  logger,
  timeZone,
});
const meetings = new MeetingService({
  calendar,
  emails,
  verdicts,
  approvals,
  settings,
  auditLog,
  userEmail,
  timeZone,
});
const summary = new SummaryService({
  emails,
  verdicts,
  rules: ruleRepository,
  predefined,
  timeZone,
});

// --- Sync -------------------------------------------------------------------------------------
const importer = new MessageImporter({
  gmail,
  emails,
  history: new ContactHistoryBuilder(contacts, senders, userEmail),
  mapper: new EmailMetadataMapper({ textNormalizer }),
  logger,
});
const sync = new GmailSync({ gmail, importer, emails, syncState, processor: ruleEngine, logger });
const backfill = new Backfill({ gmail, importer, logger });
const scheduler = new Scheduler(logger);
const pollMs = settings.get('pollIntervalSeconds', 60) * 1000;

let syncReady = false;
let syncInFlight = null;
/** One poll: first-run backfill when needed; a no-op until a Google account is connected. */
function syncNow() {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    if (!googleAuth.isConnected()) {
      syncReady = false;
      return;
    }
    if (!syncReady) {
      const { firstRun, startedAt } = await sync.initialize();
      syncReady = true;
      if (firstRun) {
        logger.info('first run: importing mail metadata');
        await backfill.run({ before: startedAt });
      }
    }
    await sync.poll();
  })().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}
scheduler.every('gmail-sync', pollMs, syncNow);

// --- API --------------------------------------------------------------------------------------
const localData = new LocalData({ databasePath: config.databasePath, keyPath });
let server = null;
async function deleteAllData() {
  scheduler.stop();
  await googleAuth.disconnect();
  db.close();
  localData.eraseAll();
  logger.info('all local data deleted; mailmoat will exit');
  setTimeout(() => {
    server?.close();
    process.exit(0);
  }, 250).unref();
}

const googleClientConfigured = config.googleClient !== undefined;
const app = new App({
  security: new SecurityMiddleware({ port: config.port }),
  routes: [
    new SettingsRoutes({ settings, anthropic, googleAuth, googleClientConfigured, auditLog }),
    new GoogleRoutes({
      googleAuth,
      clientConfigured: googleClientConfigured,
      onConnected: () => {
        syncNow().catch((error) =>
          logger.error('sync after connect failed', { error: error.name }),
        );
        return Promise.resolve();
      },
      onDisconnected: () => {
        syncReady = false;
        return Promise.resolve();
      },
      auditLog,
      logger,
    }),
    new EmailRoutes({
      emails,
      verdicts,
      rules: ruleRepository,
      contacts,
      audit: auditRepository,
      policy,
      executor,
      drafts,
      meetings,
      approvals,
      auditLog,
      timeZone,
    }),
    new ThreadRoutes({ gmail, ingestor, emails, verdicts }),
    new SearchRoutes({ gmail, importer, emails }),
    new RuleRoutes({ ruleEngine, pipeline, emails, gmail, logger }),
    new ChatRoutes({ chats }),
    new ApprovalRoutes({ approvals, timeZone }),
    new SenderRoutes({ unsubscribes }),
    new SecurityRoutes({ verdicts, audit: auditRepository, approvals }),
    new SummaryRoutes({ summary }),
    new SystemRoutes({ version, googleAuth, anthropic, syncState, emails, deleteAllData }),
  ],
  host: config.host,
  port: config.port,
  staticDir: WEB_DIST,
  logger,
});

server = await app.listen();
scheduler.start();
logger.info('mailmoat is running', {
  url: `http://${config.host}:${config.port}`,
  version,
  googleConnected: googleAuth.isConnected(),
  anthropicConfigured: anthropic.isConfigured(),
  googleClientConfigured,
});
console.log(`mailmoat ${version} → http://${config.host}:${config.port}`);

function shutdown() {
  scheduler.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

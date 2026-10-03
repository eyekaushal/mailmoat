// Attack-lab runner (PRD F13.2). From the repo root:
//   npm run attack-lab                 live: real Reader calls, records fixtures, writes a report
//   npm run attack-lab -- --replay     free: replays recorded fixtures, writes a report
//   npm run attack-lab -- --set bec --set benign --case injection/white-text-forward-bank
// Reports go to reports/attack-lab-<date>.md (+ .json). Live runs need ANTHROPIC_API_KEY in .env.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { AuditLog } from '../../src/audit/AuditLog.js';
import { Config } from '../../src/config/Config.js';
import { Logger } from '../../src/core/Logger.js';
import { Database } from '../../src/db/Database.js';
import { Migrator } from '../../src/db/Migrator.js';
import { AuditLogRepository } from '../../src/db/repositories/AuditLogRepository.js';
import { LlmClient } from '../../src/llm/LlmClient.js';
import { ModelConfig } from '../../src/llm/ModelConfig.js';
import { AttackLab, SETS, pct } from './AttackLab.js';
import { FixtureLlmClient } from './FixtureLlmClient.js';
import { Report } from './Report.js';

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    replay: { type: 'boolean', default: false },
    set: { type: 'string', multiple: true },
    case: { type: 'string', multiple: true },
  },
});
for (const set of args.set ?? []) {
  if (!SETS.includes(set)) {
    console.error(`Unknown set "${set}". Sets: ${SETS.join(', ')}`);
    process.exit(1);
  }
}

const logger = new Logger({ level: 'warn' });
const models = new ModelConfig();
let auditRepo = null;
let fixtures;
if (args.replay) {
  fixtures = new FixtureLlmClient({ dir: join(here, 'fixtures'), mode: 'replay' });
} else {
  const config = new Config(process.env);
  if (!config.anthropicApiKey) {
    console.error('ANTHROPIC_API_KEY is not set (add it to .env), or use --replay.');
    process.exit(1);
  }
  const db = new Database(':memory:');
  new Migrator(db).migrate();
  auditRepo = new AuditLogRepository(db);
  fixtures = new FixtureLlmClient({
    dir: join(here, 'fixtures'),
    mode: 'record',
    inner: new LlmClient({
      anthropic: new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 3, timeout: 60_000 }),
      models,
      auditLog: new AuditLog(auditRepo),
      logger,
    }),
    modelFor: (role) => models.forRole(role).model,
  });
}

const lab = new AttackLab({
  corpusDir: join(here, 'corpus'),
  fixtures,
  logger,
  onCase: (result) => {
    const mark = result.pass ? '✓' : result.expected.knownGap ? '~' : '✗';
    console.log(`${mark} ${result.id.padEnd(48)} ${result.actual.level}`);
  },
});
const run = await lab.run({ sets: args.set?.length ? args.set : SETS, caseIds: args.case });
if (!args.replay) fixtures.save();

const calls = auditRepo?.recent({ event: 'llm_call', limit: 100_000 }) ?? [];
const report = new Report(run, {
  mode: args.replay ? 'replay' : 'live',
  models: [...new Set(calls.map((entry) => entry.data.model))],
  llmCalls: calls.length,
  costUsd: calls.reduce((sum, entry) => sum + (entry.data.costUsd ?? 0), 0),
});

const reportsDir = join(here, '..', '..', '..', 'reports');
mkdirSync(reportsDir, { recursive: true });
const base = join(reportsDir, `attack-lab-${run.startedAt.slice(0, 10)}`);
writeFileSync(`${base}.md`, report.markdown());
writeFileSync(`${base}.json`, `${JSON.stringify(report.json(), null, 2)}\n`);

const gate = AttackLab.releaseGate(run.metrics);
console.log('');
for (const check of gate.checks) {
  console.log(
    `${check.pass ? '✅' : '❌'} ${check.label}: ${pct(check.value)} (target ${check.target})`,
  );
}
console.log(`\nGate: ${gate.pass ? 'PASS' : 'FAIL'}. Report: ${base}.md`);
if (run.missingFixtures.length) {
  console.log(`Missing fixtures: ${run.missingFixtures.length} (run without --replay to record).`);
}

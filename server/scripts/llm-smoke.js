// Developer CLI: one tiny live call to check the Anthropic key, structured output and usage logging.
// Usage (repo root): npm run llm:smoke [-- planner]   (default role: reader; costs a fraction of a cent)
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { AuditLog } from '../src/audit/AuditLog.js';
import { Config } from '../src/config/Config.js';
import { Logger } from '../src/core/Logger.js';
import { Database } from '../src/db/Database.js';
import { Migrator } from '../src/db/Migrator.js';
import { AuditLogRepository } from '../src/db/repositories/AuditLogRepository.js';
import { LlmClient } from '../src/llm/LlmClient.js';
import { ModelConfig } from '../src/llm/ModelConfig.js';

const role = process.argv[2] ?? 'reader';
const config = new Config(process.env);
if (!config.anthropicApiKey) {
  console.error('ANTHROPIC_API_KEY is not set (add it to .env).');
  process.exit(1);
}

const db = new Database(config.databasePath);
new Migrator(db).migrate();
const auditLogs = new AuditLogRepository(db);
const llm = new LlmClient({
  anthropic: new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 3, timeout: 60_000 }),
  models: new ModelConfig(),
  auditLog: new AuditLog(auditLogs),
  logger: new Logger({ level: config.logLevel }),
});

const answer = await llm.complete({
  role,
  system: 'You answer with the requested JSON only.',
  user: 'Return ok=true and the capital of France as "capital".',
  schema: z.object({ ok: z.boolean(), capital: z.string().max(40) }),
});
const [usage] = auditLogs.recent({ event: 'llm_call', limit: 1 });
console.log('answer:', answer);
console.log('usage recorded:', usage.data);

import { homedir as osHomedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { ConfigError } from '../core/errors.js';

const optionalText = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional();

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(4747),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MAILMOAT_DATA_DIR: optionalText,
  ANTHROPIC_API_KEY: optionalText,
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
});

/**
 * Validated startup configuration, read from environment variables (.env for developers).
 * Values saved through the Settings page take precedence at runtime (PRD F1.7).
 */
export class Config {
  /** Never configurable: the app must only be reachable from this machine (SECURITY_APPROACH §9). */
  static HOST = '127.0.0.1';

  #values;
  #dataDir;

  /**
   * @param {Record<string, string | undefined>} env usually `process.env`
   * @param {{ platform?: NodeJS.Platform, homedir?: string }} [system] injectable for tests
   */
  constructor(env, { platform = process.platform, homedir = osHomedir() } = {}) {
    const parsed = envSchema.safeParse(env);
    if (!parsed.success) {
      const problems = parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      throw new ConfigError(`Invalid configuration — ${problems.join('; ')}`);
    }
    this.#values = parsed.data;
    this.#dataDir = parsed.data.MAILMOAT_DATA_DIR ?? Config.#defaultDataDir(platform, homedir, env);
  }

  get host() {
    return Config.HOST;
  }

  get port() {
    return this.#values.PORT;
  }

  get logLevel() {
    return this.#values.LOG_LEVEL;
  }

  /** Folder for the database and key file — outside the repository. */
  get dataDir() {
    return this.#dataDir;
  }

  get databasePath() {
    return join(this.#dataDir, 'mailmoat.db');
  }

  /** @returns {string | undefined} */
  get anthropicApiKey() {
    return this.#values.ANTHROPIC_API_KEY;
  }

  /** @returns {{ clientId: string, clientSecret: string } | undefined} */
  get googleClient() {
    const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = this.#values;
    return clientId && clientSecret ? { clientId, clientSecret } : undefined;
  }

  static #defaultDataDir(platform, homedir, env) {
    if (platform === 'darwin') return join(homedir, 'Library', 'Application Support', 'mailmoat');
    if (platform === 'win32') {
      return join(env.APPDATA ?? join(homedir, 'AppData', 'Roaming'), 'mailmoat');
    }
    return join(env.XDG_DATA_HOME ?? join(homedir, '.local', 'share'), 'mailmoat');
  }
}

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MigrationError } from '../core/errors.js';

const DEFAULT_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));
const FILE_PATTERN = /^(\d{3})_[a-z0-9_]+\.sql$/;

/**
 * Applies numbered SQL files (`001_init.sql`, `002_…`) once each, in order.
 * Running it again applies only files it has not seen, so startup can always call `migrate()`.
 */
export class Migrator {
  #db;
  #dir;

  /**
   * @param {import('./Database.js').Database} db
   * @param {{ dir?: string }} [options]
   */
  constructor(db, { dir = DEFAULT_DIR } = {}) {
    this.#db = db;
    this.#dir = dir;
  }

  /** @returns {string[]} names of the migrations applied by this call */
  migrate() {
    this.#db.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version INTEGER PRIMARY KEY,
         name TEXT NOT NULL,
         applied_at TEXT NOT NULL
       )`,
    );
    const applied = new Set(
      this.#db.all('SELECT version FROM schema_migrations').map((row) => row.version),
    );
    const pending = this.#files().filter((file) => !applied.has(file.version));

    for (const file of pending) {
      try {
        this.#db.transaction(() => {
          this.#db.exec(readFileSync(join(this.#dir, file.name), 'utf8'));
          this.#db.run(
            'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
            [file.version, file.name, new Date().toISOString()],
          );
        });
      } catch (error) {
        throw new MigrationError(`Migration ${file.name} failed: ${error.message}`, {
          cause: error,
        });
      }
    }
    return pending.map((file) => file.name);
  }

  #files() {
    return readdirSync(this.#dir)
      .filter((name) => FILE_PATTERN.test(name))
      .map((name) => ({ name, version: Number(name.match(FILE_PATTERN)[1]) }))
      .sort((a, b) => a.version - b.version);
  }
}

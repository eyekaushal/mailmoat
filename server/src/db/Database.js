import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Thin wrapper over Node's built-in SQLite driver.
 * Repositories use only these methods, which keeps SQL access in one place and easy to fake.
 */
export class Database {
  #db;

  /** @param {string} filePath a file path, or ':memory:' for tests */
  constructor(filePath) {
    if (filePath !== ':memory:') mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    this.#db = new DatabaseSync(filePath);
    this.#db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    // WAL keeps the database consistent if the app crashes mid-write.
    if (filePath !== ':memory:') this.#db.exec('PRAGMA journal_mode = WAL;');
  }

  /** Runs one or more statements without parameters (used for migrations). */
  exec(sql) {
    this.#db.exec(sql);
  }

  /** @returns {{ changes: number | bigint, lastInsertRowid: number | bigint }} */
  run(sql, params = []) {
    return this.#db.prepare(sql).run(...params);
  }

  /** @returns {Record<string, any> | undefined} */
  get(sql, params = []) {
    const row = this.#db.prepare(sql).get(...params);
    return row ? { ...row } : undefined;
  }

  /** @returns {Record<string, any>[]} */
  all(sql, params = []) {
    return this.#db
      .prepare(sql)
      .all(...params)
      .map((row) => ({ ...row }));
  }

  /**
   * Runs `work` atomically: all of its writes are kept, or none are.
   * @template T
   * @param {() => T} work synchronous function
   * @returns {T}
   */
  transaction(work) {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.#db.close();
  }
}

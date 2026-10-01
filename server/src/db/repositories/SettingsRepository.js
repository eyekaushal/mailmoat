/**
 * Non-secret user settings stored as JSON values. Secrets belong in `SecretStore`.
 */
export class SettingsRepository {
  #db;

  /** @param {import('../Database.js').Database} db */
  constructor(db) {
    this.#db = db;
  }

  /**
   * @template T
   * @param {string} key
   * @param {T} [fallback]
   * @returns {T}
   */
  get(key, fallback) {
    const row = this.#db.get('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? JSON.parse(row.value) : fallback;
  }

  /**
   * @param {string} key
   * @param {unknown} value any JSON-serialisable value
   */
  set(key, value) {
    this.#db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(value)],
    );
  }

  /** @returns {Record<string, unknown>} */
  all() {
    return Object.fromEntries(
      this.#db
        .all('SELECT key, value FROM settings')
        .map((row) => [row.key, JSON.parse(row.value)]),
    );
  }
}

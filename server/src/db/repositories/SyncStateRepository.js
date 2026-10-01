/**
 * Where Gmail sync left off: the last Gmail history ID processed and the last poll time.
 * Lets the app resume after a restart without reprocessing mail (PRD F2.5).
 */
export class SyncStateRepository {
  #db;

  /** @param {import('../Database.js').Database} db */
  constructor(db) {
    this.#db = db;
  }

  /** @returns {string | null} */
  getHistoryId() {
    return this.#db.get('SELECT history_id FROM sync_state WHERE id = 1').history_id;
  }

  /** @param {string} historyId */
  setHistoryId(historyId) {
    this.#db.run('UPDATE sync_state SET history_id = ? WHERE id = 1', [historyId]);
  }

  /** @returns {Date | null} */
  getLastPollAt() {
    const value = this.#db.get('SELECT last_poll_at FROM sync_state WHERE id = 1').last_poll_at;
    return value ? new Date(value) : null;
  }

  /** @param {Date} at */
  markPolled(at) {
    this.#db.run('UPDATE sync_state SET last_poll_at = ? WHERE id = 1', [at.toISOString()]);
  }
}

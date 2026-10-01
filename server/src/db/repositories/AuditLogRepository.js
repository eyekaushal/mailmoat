/**
 * @typedef {object} AuditEntry
 * @property {string} ts ISO time
 * @property {string} actor `system`, `user`, `planner`, …
 * @property {string} event e.g. `llm_call`, `verdict`, `policy_decision`
 * @property {string | null} [subject] e.g. a Gmail id or LLM role
 * @property {string | null} [decision]
 * @property {string | null} [reason]
 * @property {unknown} [data] stored as JSON
 */

/** Append-only access to `audit_log`; the database triggers reject updates and deletes. */
export class AuditLogRepository {
  #db;

  /** @param {import('../Database.js').Database} db */
  constructor(db) {
    this.#db = db;
  }

  /** @param {AuditEntry} entry */
  append({ ts, actor, event, subject = null, decision = null, reason = null, data = null }) {
    this.#db.run(
      `INSERT INTO audit_log (ts, actor, event, subject, decision, reason, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ts, actor, event, subject, decision, reason, data === null ? null : JSON.stringify(data)],
    );
  }

  /**
   * @param {{ event?: string, limit?: number }} [filter]
   * @returns {(AuditEntry & { id: number })[]} newest first
   */
  recent({ event, limit = 100 } = {}) {
    const rows = event
      ? this.#db.all('SELECT * FROM audit_log WHERE event = ? ORDER BY id DESC LIMIT ?', [
          event,
          limit,
        ])
      : this.#db.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [limit]);
    return rows.map((row) => ({
      id: row.id,
      ts: row.ts,
      actor: row.actor,
      event: row.event,
      subject: row.subject,
      decision: row.decision,
      reason: row.reason,
      data: row.data_json === null ? null : JSON.parse(row.data_json),
    }));
  }
}

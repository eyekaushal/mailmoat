export const DRAFT_STATUSES = Object.freeze(['DRAFTED', 'DELETED']);

/** Which Gmail drafts mailmoat wrote, for the dashboard list and the stale-draft sweep (PRD F6). */
export class DraftRepository {
  #db;

  /** @param {import('../Database.js').Database} db */
  constructor(db) {
    this.#db = db;
  }

  /** @param {{ draftId: string, gmailId: string, at: Date }} draft */
  save({ draftId, gmailId, at }) {
    this.#db.run(
      `INSERT INTO drafts (gmail_draft_id, gmail_id, status, created_at) VALUES (?, ?, 'DRAFTED', ?)`,
      [draftId, gmailId, at.toISOString()],
    );
  }

  /** @returns {{ draftId: string, gmailId: string, status: string, createdAt: string } | undefined} */
  get(draftId) {
    const row = this.#db.get('SELECT * FROM drafts WHERE gmail_draft_id = ?', [draftId]);
    return row && this.#toDraft(row);
  }

  /** @param {string} draftId @param {'DRAFTED'|'DELETED'} status */
  setStatus(draftId, status) {
    if (!DRAFT_STATUSES.includes(status)) throw new RangeError(`Unknown draft status: ${status}`);
    this.#db.run('UPDATE drafts SET status = ? WHERE gmail_draft_id = ?', [status, draftId]);
  }

  /**
   * Newest first, with the sender metadata of the email being answered.
   * @param {{ status?: string, limit?: number }} [filter]
   * @returns {{ draftId: string, gmailId: string, status: string, createdAt: string,
   *   fromAddr: string, fromDomain: string, date: string }[]}
   */
  list({ status, limit = 100 } = {}) {
    const clause = status ? 'WHERE d.status = ?' : '';
    const params = status ? [status, limit] : [limit];
    return this.#db
      .all(
        `SELECT d.*, e.from_addr, e.from_domain, e.date
         FROM drafts d JOIN emails e ON e.gmail_id = d.gmail_id
         ${clause} ORDER BY d.created_at DESC LIMIT ?`,
        params,
      )
      .map((row) => ({
        ...this.#toDraft(row),
        fromAddr: row.from_addr,
        fromDomain: row.from_domain,
        date: row.date,
      }));
  }

  /**
   * Unsent mailmoat drafts created before `before` (PRD F6.5).
   * @param {Date} before
   */
  listStale(before) {
    return this.#db
      .all(`SELECT * FROM drafts WHERE status = 'DRAFTED' AND created_at < ? ORDER BY created_at`, [
        before.toISOString(),
      ])
      .map((row) => this.#toDraft(row));
  }

  #toDraft(row) {
    return {
      draftId: row.gmail_draft_id,
      gmailId: row.gmail_id,
      status: row.status,
      createdAt: row.created_at,
    };
  }
}

export const SENDER_STATUSES = Object.freeze(['NONE', 'KEPT', 'UNSUBSCRIBED', 'BLOCKED']);

/**
 * Per-sender statistics and unsubscribe/block status (Bulk Unsubscribe, PRD F9).
 */
export class SenderRepository {
  #db;

  /** @param {import('../Database.js').Database} db */
  constructor(db) {
    this.#db = db;
  }

  /**
   * @param {string} address
   * @param {{ at: Date, isRead: boolean }} message
   */
  recordReceived(address, { at, isRead }) {
    this.#db.run(
      `INSERT INTO senders (address, email_count, read_count, last_received) VALUES (?, 1, ?, ?)
       ON CONFLICT(address) DO UPDATE SET
         email_count = email_count + 1,
         read_count = read_count + excluded.read_count,
         last_received = MAX(COALESCE(last_received, ''), excluded.last_received)`,
      [address.toLowerCase(), Number(isRead), at.toISOString()],
    );
  }

  /**
   * The Bulk Unsubscribe listing (PRD F9.1): per sender, counts plus the latest inbound email's
   * display name (attacker-controlled; shown as plain text only), unsubscribe facts and verdict. Sorted by email count, or by read rate (least read first).
   * @param {{ since?: string, sort?: 'count'|'read', limit?: number }} [filter]
   * @returns {{ address: string, name: string | null, status: string, emailCount: number,
   *   readCount: number, lastReceived: string | null, latest: { gmailId: string, unsubscribeUrl: string | null,
   *   oneClick: boolean, level: string | null } | null }[]}
   */
  list({ since, sort = 'count', limit = 200 } = {}) {
    const order =
      sort === 'read'
        ? 'CAST(s.read_count AS REAL) / MAX(s.email_count, 1) ASC, s.email_count DESC'
        : 's.email_count DESC, s.last_received DESC';
    const params = since ? [since, limit] : [limit];
    return this.#db
      .all(
        `SELECT s.*, e.gmail_id AS latest_id, e.from_name, e.unsubscribe_url, e.one_click, v.level
         FROM senders s
         LEFT JOIN emails e ON e.gmail_id = (
           SELECT gmail_id FROM emails
           WHERE from_addr = s.address AND direction = 'inbound'
           ORDER BY date DESC LIMIT 1)
         LEFT JOIN verdicts v ON v.gmail_id = e.gmail_id
         ${since ? 'WHERE s.last_received >= ?' : ''}
         ORDER BY ${order}, s.address LIMIT ?`,
        params,
      )
      .map((row) => ({
        address: row.address,
        name: row.from_name ?? null,
        status: row.status,
        emailCount: row.email_count,
        readCount: row.read_count,
        lastReceived: row.last_received,
        latest: row.latest_id
          ? {
              gmailId: row.latest_id,
              unsubscribeUrl: row.unsubscribe_url,
              oneClick: row.one_click === 1,
              level: row.level ?? null,
            }
          : null,
      }));
  }

  /**
   * @param {string} address
   * @param {'NONE'|'KEPT'|'UNSUBSCRIBED'|'BLOCKED'} status
   */
  setStatus(address, status) {
    if (!SENDER_STATUSES.includes(status)) throw new RangeError(`Unknown sender status: ${status}`);
    this.#db.run(
      `INSERT INTO senders (address, status) VALUES (?, ?)
       ON CONFLICT(address) DO UPDATE SET status = excluded.status`,
      [address.toLowerCase(), status],
    );
  }

  /**
   * @returns {{ address: string, status: string, emailCount: number, readCount: number,
   *   lastReceived: string | null } | undefined}
   */
  get(address) {
    const row = this.#db.get('SELECT * FROM senders WHERE address = ?', [address.toLowerCase()]);
    return (
      row && {
        address: row.address,
        name: row.from_name ?? null,
        status: row.status,
        emailCount: row.email_count,
        readCount: row.read_count,
        lastReceived: row.last_received,
      }
    );
  }
}

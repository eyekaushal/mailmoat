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
   * @returns {{ address: string, status: string, emailCount: number, readCount: number,
   *   lastReceived: string | null } | undefined}
   */
  get(address) {
    const row = this.#db.get('SELECT * FROM senders WHERE address = ?', [address.toLowerCase()]);
    return (
      row && {
        address: row.address,
        status: row.status,
        emailCount: row.email_count,
        readCount: row.read_count,
        lastReceived: row.last_received,
      }
    );
  }
}

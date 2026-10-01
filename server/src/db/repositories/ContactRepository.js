/**
 * Who the user corresponds with. Feeds the first-time-sender and lookalike signals.
 *
 * `sentCount` (the user wrote to them) is strong evidence of a real relationship.
 * `receivedCount` alone is weak: anyone can send one harmless email to become "known",
 * so signals must not treat received-only addresses as trusted contacts.
 */
export class ContactRepository {
  #db;

  /** @param {import('../Database.js').Database} db */
  constructor(db) {
    this.#db = db;
  }

  /** The user sent mail to `address`. */
  recordSent(address, at) {
    this.#upsert(address, at, 'sent_count');
  }

  /** The user received mail from `address`. */
  recordReceived(address, at) {
    this.#upsert(address, at, 'received_count');
  }

  /**
   * @returns {{ address: string, domain: string, firstSeen: string, lastSeen: string,
   *   sentCount: number, receivedCount: number, trusted: boolean } | undefined}
   */
  get(address) {
    const row = this.#db.get('SELECT * FROM contacts WHERE address = ?', [address.toLowerCase()]);
    return (
      row && {
        address: row.address,
        domain: row.domain,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        sentCount: row.sent_count,
        receivedCount: row.received_count,
        trusted: row.trusted === 1,
      }
    );
  }

  /** Whether the user has ever written to anyone at `domain`. */
  hasSentToDomain(domain) {
    return Boolean(
      this.#db.get('SELECT 1 AS found FROM contacts WHERE domain = ? AND sent_count > 0', [
        domain.toLowerCase(),
      ]),
    );
  }

  #upsert(address, at, counter) {
    const normalized = address.toLowerCase();
    const iso = at.toISOString();
    this.#db.run(
      `INSERT INTO contacts (address, domain, first_seen, last_seen, ${counter})
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(address) DO UPDATE SET
         ${counter} = ${counter} + 1,
         first_seen = MIN(first_seen, excluded.first_seen),
         last_seen = MAX(last_seen, excluded.last_seen)`,
      [normalized, normalized.split('@').pop(), iso, iso],
    );
  }
}

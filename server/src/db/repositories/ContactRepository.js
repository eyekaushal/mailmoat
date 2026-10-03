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

  /**
   * The user sent mail to `address`.
   * @param {string} address
   * @param {Date} at
   * @param {string | null} [name] how the user addressed them; the latest non-empty one wins
   */
  recordSent(address, at, name = null) {
    this.#upsert(address, at, 'sent_count', name);
  }

  /** The user received mail from `address`. */
  recordReceived(address, at) {
    this.#upsert(address, at, 'received_count');
  }

  /**
   * @returns {{ address: string, domain: string, name: string | null, firstSeen: string,
   *   lastSeen: string, sentCount: number, receivedCount: number, trusted: boolean } | undefined}
   */
  get(address) {
    const row = this.#db.get('SELECT * FROM contacts WHERE address = ?', [address.toLowerCase()]);
    return (
      row && {
        address: row.address,
        domain: row.domain,
        name: row.name,
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

  /**
   * "Mark as trusted sender" (PRD F3.9): a user-sourced fact that skips the identity signals
   * S9/S10 only. Creates the contact if the address was never seen.
   * @param {string} address
   * @param {boolean} trusted
   * @param {Date} at
   */
  setTrusted(address, trusted, at) {
    const normalized = address.toLowerCase();
    const iso = at.toISOString();
    this.#db.run(
      `INSERT INTO contacts (address, domain, first_seen, last_seen, trusted)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(address) DO UPDATE SET trusted = excluded.trusted`,
      [normalized, normalized.split('@').pop(), iso, iso, Number(trusted)],
    );
  }

  /** @returns {string[]} every domain the user has written to */
  sentDomains() {
    return this.#db
      .all('SELECT DISTINCT domain FROM contacts WHERE sent_count > 0')
      .map((row) => row.domain);
  }

  /** @returns {{ address: string, domain: string, name: string }[]} people the user wrote to by name */
  namedContacts() {
    return this.#db.all(
      'SELECT address, domain, name FROM contacts WHERE sent_count > 0 AND name IS NOT NULL',
    );
  }

  #upsert(address, at, counter, name = null) {
    const normalized = address.toLowerCase();
    const iso = at.toISOString();
    this.#db.run(
      `INSERT INTO contacts (address, domain, first_seen, last_seen, ${counter}, name)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(address) DO UPDATE SET
         ${counter} = ${counter} + 1,
         name = COALESCE(excluded.name, name),
         first_seen = MIN(first_seen, excluded.first_seen),
         last_seen = MAX(last_seen, excluded.last_seen)`,
      [normalized, normalized.split('@').pop(), iso, iso, name || null],
    );
  }
}

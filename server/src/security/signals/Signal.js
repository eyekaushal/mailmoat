/**
 * @typedef {'low'|'medium'|'high'} Severity
 *
 * @typedef {object} SignalResult
 * @property {string} id e.g. `S1`
 * @property {string} name e.g. `AUTH_DMARC_FAIL`
 * @property {Severity} severity
 * @property {string} reason plain English for the user. May quote attacker-controlled text
 *   (domains, filenames), so it is display-only and must never reach the Planner.
 *
 * @typedef {object} SignalContext
 * @property {Pick<import('../../db/repositories/ContactRepository.js').ContactRepository, 'get'|'hasSentToDomain'|'sentDomains'|'namedContacts'>} contacts
 * @property {{ claims_to_be: string } | null} readerForm null until the Reader has run
 */

/**
 * One deterministic check on an ingested email. Subclasses implement {@link Signal#evaluate}
 * and build their result with {@link Signal#fire}.
 */
export class Signal {
  /** @param {{ id: string, name: string, severity: Severity }} definition */
  constructor({ id, name, severity }) {
    this.id = id;
    this.name = name;
    this.severity = severity;
  }

  /**
   * @param {import('../ingest/EmailIngestor.js').IngestedEmail} _email
   * @param {SignalContext} _context
   * @returns {SignalResult | null} null when the signal does not apply
   */
  evaluate(_email, _context) {
    throw new Error(`${this.constructor.name} must implement evaluate()`);
  }

  /**
   * @param {string} reason
   * @returns {SignalResult}
   */
  fire(reason) {
    return { id: this.id, name: this.name, severity: this.severity, reason };
  }
}

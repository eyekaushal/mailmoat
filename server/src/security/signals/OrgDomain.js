import freemailDomains from './data/freemail.json' with { type: 'json' };

const FREEMAIL = new Set(freemailDomains);
// Second-level labels under country TLDs that are registries, not organisations (acme.co.uk).
const REGISTRY_LABELS = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'ltd', 'plc']);

/**
 * Domain helpers shared by the sender signals.
 *
 * The organisational domain is approximated without the Public Suffix List: last two labels, or
 * last three for `co.uk`-style suffixes. Good enough to treat `mail.acme.com` and `acme.com` as
 * the same sender; signals that need exact matches compare full domains instead.
 */
export class OrgDomain {
  /**
   * @param {string} domain
   * @returns {string}
   */
  static of(domain) {
    const labels = domain.toLowerCase().replace(/\.$/, '').split('.');
    const keep =
      labels.length >= 3 && labels.at(-1).length === 2 && REGISTRY_LABELS.has(labels.at(-2))
        ? 3
        : 2;
    return labels.slice(-keep).join('.');
  }

  /** @returns {boolean} */
  static same(first, second) {
    return OrgDomain.of(first) === OrgDomain.of(second);
  }

  /** @returns {boolean} */
  static isFreemail(domain) {
    return FREEMAIL.has(domain.toLowerCase());
  }

  /** @returns {string} part after the last `@`, lower-cased */
  static ofAddress(address) {
    return address.split('@').pop().toLowerCase();
  }
}

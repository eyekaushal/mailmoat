import brands from './data/brands.json' with { type: 'json' };
import { OrgDomain } from './OrgDomain.js';

/**
 * @typedef {{ name: string, keywords: string[], domains: string[] }} Brand
 * keywords: lower-case alphanumeric tokens that name the brand in a domain or display name.
 */

/**
 * Frequently impersonated brands and the domains they really send from. Free-mail domains are
 * deliberately absent: anyone can sign up at outlook.com, so it proves nothing about Microsoft.
 */
export class BrandList {
  /** @type {Brand[]} */
  #brands = brands;
  #confusables;
  #keywords;

  /** @param {import('./Confusables.js').Confusables} confusables */
  constructor(confusables) {
    this.#confusables = confusables;
    this.#keywords = brands.flatMap((brand) =>
      brand.keywords.map((keyword) => ({ brand, skeleton: confusables.skeleton(keyword) })),
    );
  }

  /** @returns {Brand[]} */
  all() {
    return this.#brands;
  }

  /**
   * The brand named in a display name or domain, compared by skeleton so `PayPaI` or `Ꭺmazon`
   * still count. Adjacent words are joined so `Wells Fargo` and `wells-fargo` match `wellsfargo`.
   * @param {string} text
   * @returns {Brand | undefined}
   */
  namedIn(text) {
    // TR39 maps a capital I to l, which catches "PayPaI" but would hide "LinkedIn", "IRS" or
    // "ICICI"; matching the lower-cased spelling as well keeps both.
    return (
      this.#match(this.#confusables.skeleton(text)) ??
      this.#match(this.#confusables.skeleton(text.toLowerCase()))
    );
  }

  #match(skeleton) {
    const tokens = skeleton.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    for (let start = 0; start < tokens.length; start += 1) {
      let joined = '';
      for (let end = start; end < tokens.length && joined.length < 30; end += 1) {
        joined += tokens[end];
        const match = this.#keywords.find((keyword) => keyword.skeleton === joined);
        if (match) return match.brand;
      }
    }
    return undefined;
  }

  /** @returns {boolean} whether `domain` (or its organisation) belongs to `brand` */
  owns(brand, domain) {
    const org = OrgDomain.of(domain);
    return brand.domains.some((owned) => owned === domain || OrgDomain.of(owned) === org);
  }

  /**
   * The brand this email verifiably comes from: Google's own stamp says the From domain passed
   * DMARC, and that domain is one the brand sends from. An attacker cannot forge this without
   * controlling the brand's mail, so genuine receipts, alerts and platform relays (Drive shares)
   * are not "unfamiliar senders". Any other case, including DMARC failures, returns undefined.
   * @param {import('../ingest/EmailIngestor.js').IngestedEmail} email
   * @returns {Brand | undefined}
   */
  authenticatedOwner(email) {
    if (!email.from || !email.auth?.trusted || email.auth.dmarc?.result !== 'pass')
      return undefined;
    const domain = OrgDomain.ofAddress(email.from.address);
    return this.#brands.find((brand) => this.owns(brand, domain));
  }
}

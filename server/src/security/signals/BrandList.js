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
    const tokens = this.#confusables
      .skeleton(text)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
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
}

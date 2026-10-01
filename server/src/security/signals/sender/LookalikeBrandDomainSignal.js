import { domainToUnicode } from 'node:url';
import { OrgDomain } from '../OrgDomain.js';
import { Signal } from '../Signal.js';

// Fuzzy matching of brand words inside domains only for longer words; "ups" is one edit from "ops".
const FUZZY_KEYWORD_CHARS = 5;

/**
 * S6: the sender's domain imitates a well-known brand, either as a near-copy of its real domain
 * (netfIix.com) or by using the brand's name in a domain it does not own (netflix-account-help.com).
 */
export class LookalikeBrandDomainSignal extends Signal {
  #similarity;
  #brands;

  /**
   * @param {import('../DomainSimilarity.js').DomainSimilarity} similarity
   * @param {import('../BrandList.js').BrandList} brands
   */
  constructor(similarity, brands) {
    super({ id: 'S6', name: 'LOOKALIKE_BRAND_DOMAIN', severity: 'medium' });
    this.#similarity = similarity;
    this.#brands = brands;
  }

  evaluate(email) {
    if (!email.from) return null;
    const domain = OrgDomain.ofAddress(email.from.address);
    if (OrgDomain.isFreemail(domain)) return null;
    const brands = this.#brands.all();
    if (brands.some((brand) => this.#brands.owns(brand, domain))) return null;

    for (const brand of brands) {
      const imitated = brand.domains.find((genuine) =>
        this.#similarity.isLookalike(domain, genuine),
      );
      if (imitated) {
        return this.fire(`The sender domain ${domain} looks like ${imitated} (${brand.name}).`);
      }
    }
    const named =
      this.#brands.namedIn(domainToUnicode(domain) || domain) ?? this.#fuzzyBrand(domain);
    if (!named) return null;
    return this.fire(
      `The sender domain ${domain} uses the name ${named.name} but does not belong to ${named.name}.`,
    );
  }

  /** Catches one-letter misspellings inside longer domains, e.g. `amazn-orders.com`. */
  #fuzzyBrand(domain) {
    const tokens = domain.split(/[.-]/).filter((token) => token.length >= FUZZY_KEYWORD_CHARS);
    return this.#brands
      .all()
      .find((brand) =>
        brand.keywords.some(
          (keyword) =>
            keyword.length >= FUZZY_KEYWORD_CHARS &&
            tokens.some((token) => this.#similarity.distance(token, keyword) <= 1),
        ),
      );
  }
}

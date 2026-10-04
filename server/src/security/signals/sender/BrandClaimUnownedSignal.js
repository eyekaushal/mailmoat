import { OrgDomain } from '../OrgDomain.js';
import { Signal } from '../Signal.js';

/**
 * S22: the email presents itself as a listed brand (the Reader's `claimed_brand`), but the
 * sender's domain is not one that brand sends from. The claim is the Reader's reading of
 * untrusted text; the ownership check is code. A Reader that hides the claim gains nothing the
 * display-name (S7) and look-alike (S6) checks do not already cover; one that invents a claim can
 * only raise the level.
 */
export class BrandClaimUnownedSignal extends Signal {
  #brands;

  /** @param {import('../BrandList.js').BrandList} brands */
  constructor(brands) {
    super({ id: 'S22', name: 'BRAND_CLAIM_UNOWNED', severity: 'medium' });
    this.#brands = brands;
  }

  evaluate(email, context) {
    const claimed = context.readerForm?.claimed_brand;
    if (!claimed || !email.from) return null;
    const brand = this.#brands.namedIn(claimed);
    if (!brand) return null;
    const domain = OrgDomain.ofAddress(email.from.address);
    if (this.#brands.owns(brand, domain)) return null;
    return this.fire(
      `The email presents itself as ${brand.name}, but comes from ${domain}, which ${brand.name} does not use.`,
    );
  }
}

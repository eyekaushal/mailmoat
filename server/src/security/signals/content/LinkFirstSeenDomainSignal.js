import { OrgDomain } from '../OrgDomain.js';
import { Signal } from '../Signal.js';

const MAX_LISTED = 3;

/**
 * S18: links go to domains outside the user's history. History here is the domains the user has
 * written to plus the bundled brands; bodies of past mail are not stored, so link domains seen in
 * earlier emails are not known, but the sender's own DMARC-aligned domain is. Low severity: it
 * matters mainly in combination with other evidence.
 */
export class LinkFirstSeenDomainSignal extends Signal {
  #brands;

  /** @param {import('../BrandList.js').BrandList} brands */
  constructor(brands) {
    super({ id: 'S18', name: 'LINK_FIRST_SEEN_DOMAIN', severity: 'low' });
    this.#brands = brands;
  }

  evaluate(email, context) {
    const known = new Set([
      ...context.contacts.sentDomains().map((domain) => OrgDomain.of(domain)),
      ...this.#brands.all().flatMap((brand) => brand.domains.map((domain) => OrgDomain.of(domain))),
    ]);
    // A first bill or receipt links to the sender's own site; when DMARC proves the sender owns
    // that domain, the link is no more unfamiliar than the sender (S9/S10 already say so).
    if (email.from && email.auth?.trusted && email.auth.dmarc?.result === 'pass')
      known.add(OrgDomain.ofAddress(email.from.address));
    const unseen = [
      ...new Set(email.links.filter((link) => link.host).map((link) => OrgDomain.of(link.host))),
    ].filter((domain) => !known.has(domain));
    if (unseen.length === 0) return null;
    const listed = unseen.slice(0, MAX_LISTED).join(', ');
    const more = unseen.length > MAX_LISTED ? ` and ${unseen.length - MAX_LISTED} more` : '';
    return this.fire(`Links go to domains you have never emailed: ${listed}${more}.`);
  }
}

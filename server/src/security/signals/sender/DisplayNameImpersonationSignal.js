import { OrgDomain } from '../OrgDomain.js';
import { Signal } from '../Signal.js';

const EMAIL_IN_TEXT = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const NAME_WORD_CHARS = 2;

/**
 * S7: the display name claims an identity the address does not back up: a brand, a contact the
 * user writes to, or a different email address shown as the name.
 */
export class DisplayNameImpersonationSignal extends Signal {
  #brands;
  #confusables;

  /**
   * @param {import('../BrandList.js').BrandList} brands
   * @param {import('../Confusables.js').Confusables} confusables
   */
  constructor(brands, confusables) {
    super({ id: 'S7', name: 'DISPLAY_NAME_IMPERSONATION', severity: 'medium' });
    this.#brands = brands;
    this.#confusables = confusables;
  }

  evaluate(email, context) {
    const name = email.from?.name;
    if (!name) return null;
    const { address } = email.from;
    const domain = OrgDomain.ofAddress(address);

    const shownAddress = EMAIL_IN_TEXT.exec(name)?.[0].toLowerCase();
    if (shownAddress && shownAddress !== address) {
      return this.fire(
        `The sender name shows ${shownAddress}, but the email comes from ${address}.`,
      );
    }

    const brand = this.#brands.namedIn(name);
    if (brand && !this.#brands.owns(brand, domain)) {
      return this.fire(
        `The sender name says ${brand.name}, but the email comes from ${domain}, which ${brand.name} does not use.`,
      );
    }

    // Someone the user writes to at this exact address is not impersonating anyone.
    if (context.contacts.get(address)?.sentCount > 0) return null;
    // Platform relays ("Priya Shah (via Google Drive)" from google.com) carry a contact's name
    // on the platform's own authenticated domain; a forged relay fails DMARC and still fires.
    if (this.#brands.authenticatedOwner(email)) return null;
    const words = this.#words(name);
    const contact = context.contacts
      .namedContacts()
      .find(
        (candidate) =>
          !OrgDomain.same(candidate.domain, domain) &&
          this.#isFullNameIn(this.#words(candidate.name), words),
      );
    if (!contact) return null;
    return this.fire(
      `The sender name matches your contact ${contact.name}, but this email comes from ${domain}, not ${contact.domain}.`,
    );
  }

  /** Requires a full name (two or more words) so a shared first name alone never matches. */
  #isFullNameIn(contactWords, displayWords) {
    return contactWords.size >= 2 && [...contactWords].every((word) => displayWords.has(word));
  }

  #words(text) {
    if (text.includes('@')) return new Set();
    return new Set(
      this.#confusables
        .skeleton(text)
        .split(/[^\p{L}]+/u)
        .filter((word) => word.length >= NAME_WORD_CHARS),
    );
  }
}

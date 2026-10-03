import { domainToASCII } from 'node:url';
import { OrgDomain } from '../OrgDomain.js';
import { Signal } from '../Signal.js';

// A word in the link text that looks like a URL or bare domain (`paypal.com`, `www.x.org/login`).
const DOMAIN_IN_TEXT =
  /^(?:https?:\/\/)?(?:www\.)?((?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,24})(?:[/:?#].*)?$/iu;

/**
 * S14: a link lies about where it goes, either because its visible text shows one domain while
 * the href goes to another, or because the href starts with a real domain that is only a
 * subdomain of somewhere else (`netflix.com.account-verify.example`).
 */
export class LinkTextHrefMismatchSignal extends Signal {
  #brands;

  /** @param {import('../BrandList.js').BrandList} brands */
  constructor(brands) {
    super({ id: 'S14', name: 'LINK_TEXT_HREF_MISMATCH', severity: 'medium' });
    this.#brands = brands;
  }

  evaluate(email, context) {
    const genuine = [
      ...this.#brands.all().flatMap((brand) => brand.domains),
      ...context.contacts.sentDomains(),
    ];
    for (const link of email.links) {
      if (!link.host) continue;
      const shown = link.source === 'html' ? this.#shownDomain(link.text) : null;
      if (shown && !OrgDomain.same(shown, link.host) && !this.#isSendersOwnDomain(shown, email)) {
        return this.fire(`A link shows ${shown} but actually goes to ${link.host}.`);
      }
      // `netflix.com.evil.example` and `login.microsoftonline.com.evil.example` both read as the
      // real site to a person; the genuine domain is a whole label sequence, not a suffix.
      const embedded = genuine.find(
        (domain) =>
          (link.host.startsWith(`${domain}.`) || link.host.includes(`.${domain}.`)) &&
          !OrgDomain.same(domain, link.host),
      );
      if (embedded) {
        const how = link.host.startsWith(`${embedded}.`) ? 'starts with' : 'contains';
        return this.fire(
          `The link address ${link.host} ${how} ${embedded} but really belongs to ${OrgDomain.of(link.host)}.`,
        );
      }
    }
    return null;
  }

  #shownDomain(text) {
    const match = text
      .split(/\s+/)
      .map((word) => DOMAIN_IN_TEXT.exec(word.replace(/[.,;:!?)]+$/, '')))
      .find(Boolean);
    return match ? (domainToASCII(match[1]) || match[1]).toLowerCase() : null;
  }

  /**
   * Newsletters show their own address but route the click through a tracking service. That is
   * only accepted when the email provably comes from the domain it shows (DMARC pass).
   */
  #isSendersOwnDomain(shown, email) {
    return (
      email.auth.trusted &&
      email.auth.dmarc.result === 'pass' &&
      email.from !== null &&
      OrgDomain.same(shown, OrgDomain.ofAddress(email.from.address))
    );
  }
}

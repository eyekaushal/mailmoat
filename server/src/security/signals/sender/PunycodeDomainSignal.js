import { domainToASCII, domainToUnicode } from 'node:url';
import { OrgDomain } from '../OrgDomain.js';
import { Signal } from '../Signal.js';

/**
 * S8: an internationalised (xn--) domain in the sender, Reply-To or a link. Such domains can be
 * built from letters of other scripts that look identical to Latin ones.
 */
export class PunycodeDomainSignal extends Signal {
  constructor() {
    super({ id: 'S8', name: 'PUNYCODE_DOMAIN', severity: 'medium' });
  }

  evaluate(email) {
    const candidates = [
      ...(email.from ? [{ where: 'sender', domain: OrgDomain.ofAddress(email.from.address) }] : []),
      ...email.replyTo.map(({ address }) => ({
        where: 'Reply-To',
        domain: OrgDomain.ofAddress(address),
      })),
      ...email.links
        .filter((link) => link.host)
        .map((link) => ({ where: 'link', domain: link.host })),
    ];
    for (const { where, domain } of candidates) {
      const ascii = domainToASCII(domain) || domain;
      if (ascii.split('.').some((label) => label.startsWith('xn--'))) {
        return this.fire(
          `The ${where} domain ${domainToUnicode(ascii)} (${ascii}) uses international characters that can imitate other letters.`,
        );
      }
    }
    return null;
  }
}

import { OrgDomain } from '../OrgDomain.js';
import { Signal } from '../Signal.js';

/** S5: the sender's domain imitates a domain the user really writes to (acme-c0rp.com → acme-corp.com). */
export class LookalikeContactDomainSignal extends Signal {
  #similarity;

  /** @param {import('../DomainSimilarity.js').DomainSimilarity} similarity */
  constructor(similarity) {
    super({ id: 'S5', name: 'LOOKALIKE_CONTACT_DOMAIN', severity: 'high' });
    this.#similarity = similarity;
  }

  evaluate(email, context) {
    if (!email.from) return null;
    const domain = OrgDomain.ofAddress(email.from.address);
    // A real free-mail provider is not a lookalike of anything; its users are judged by S9-S11.
    if (OrgDomain.isFreemail(domain)) return null;

    const known = context.contacts.sentDomains();
    if (known.some((genuine) => OrgDomain.same(genuine, domain))) return null;
    const imitated = known.find((genuine) => this.#similarity.isLookalike(domain, genuine));
    if (!imitated) return null;
    return this.fire(`The sender domain ${domain} looks like ${imitated}, a domain you email.`);
  }
}

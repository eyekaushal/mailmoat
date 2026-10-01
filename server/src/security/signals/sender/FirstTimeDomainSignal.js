import { OrgDomain } from '../OrgDomain.js';
import { Signal } from '../Signal.js';

/**
 * S10: the user has never written to anyone at this domain. For free-mail domains every address
 * is a separate person, so having written to some gmail.com user says nothing about this one.
 */
export class FirstTimeDomainSignal extends Signal {
  constructor() {
    super({ id: 'S10', name: 'FIRST_TIME_DOMAIN', severity: 'low' });
  }

  evaluate(email, context) {
    if (!email.from) return null;
    const contact = context.contacts.get(email.from.address);
    if (contact?.trusted) return null;
    const domain = OrgDomain.ofAddress(email.from.address);
    const known = OrgDomain.isFreemail(domain)
      ? contact?.sentCount > 0
      : context.contacts.hasSentToDomain(domain);
    if (known) return null;
    return this.fire(`You have never written to anyone at ${domain}.`);
  }
}

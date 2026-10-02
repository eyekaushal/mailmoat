import { OrgDomain } from '../OrgDomain.js';
import { Signal } from '../Signal.js';

/**
 * S3: the email is DKIM-signed, but only by domains unrelated to the From domain. Common for
 * small senders using an email service, so it is low severity on its own.
 */
export class DkimDomainMismatchSignal extends Signal {
  constructor() {
    super({ id: 'S3', name: 'DKIM_DOMAIN_MISMATCH', severity: 'low' });
  }

  evaluate(email) {
    if (!email.auth.trusted || !email.from) return null;
    const fromDomain = OrgDomain.ofAddress(email.from.address);
    const signers = email.auth.dkim
      .filter((signature) => signature.result === 'pass' && signature.domain)
      .map((signature) => signature.domain);
    if (signers.length === 0 || signers.some((domain) => OrgDomain.same(domain, fromDomain))) {
      return null;
    }
    return this.fire(
      `The email is signed by ${signers[0]}, not by the sender's domain ${fromDomain}.`,
    );
  }
}

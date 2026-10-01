import { OrgDomain } from '../OrgDomain.js';
import { Signal } from '../Signal.js';

/** S1: Google's own stamp says the From domain failed DMARC, i.e. the From address is likely forged. */
export class DmarcFailSignal extends Signal {
  constructor() {
    super({ id: 'S1', name: 'AUTH_DMARC_FAIL', severity: 'high' });
  }

  evaluate(email) {
    if (!email.auth.trusted || email.auth.dmarc.result !== 'fail' || !email.from) return null;
    const domain = OrgDomain.ofAddress(email.from.address);
    return this.fire(
      `Gmail could not verify that this email really comes from ${domain} (DMARC failed).`,
    );
  }
}

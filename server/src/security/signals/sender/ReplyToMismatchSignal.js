import { OrgDomain } from '../OrgDomain.js';
import { Signal } from '../Signal.js';

/**
 * S4: replies would go to a different organisation than the sender's — the classic BEC move.
 * Header-based exemptions (e.g. List-Id) are not used: an attacker can add any header. The only
 * exemption is a Reply-To address the user has written to before.
 */
export class ReplyToMismatchSignal extends Signal {
  constructor() {
    super({ id: 'S4', name: 'REPLY_TO_MISMATCH', severity: 'medium' });
  }

  evaluate(email, context) {
    if (!email.from) return null;
    const fromDomain = OrgDomain.ofAddress(email.from.address);
    const mismatch = email.replyTo.find(
      ({ address }) =>
        !OrgDomain.same(OrgDomain.ofAddress(address), fromDomain) &&
        !(context.contacts.get(address)?.sentCount > 0),
    );
    if (!mismatch) return null;
    return this.fire(
      `Replies go to ${mismatch.address}, not to the sender's domain ${fromDomain}.`,
    );
  }
}

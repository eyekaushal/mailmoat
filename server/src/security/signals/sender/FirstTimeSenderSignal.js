import { Signal } from '../Signal.js';

/**
 * S9: the user has never written to this address. Received-only history does not count: an
 * attacker can make themselves "known" by sending one harmless email first.
 */
export class FirstTimeSenderSignal extends Signal {
  constructor() {
    super({ id: 'S9', name: 'FIRST_TIME_SENDER', severity: 'low' });
  }

  evaluate(email, context) {
    if (!email.from) return null;
    const contact = context.contacts.get(email.from.address);
    if (contact?.trusted || contact?.sentCount > 0) return null;
    return this.fire(`You have never written to ${email.from.address}.`);
  }
}

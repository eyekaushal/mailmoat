import { Signal } from '../Signal.js';

/**
 * S2: neither SPF nor DKIM passed. Also fires when no trusted Google stamp exists, because
 * "we could not check" must not look the same as "it checked out" (fail closed).
 */
export class SpfDkimFailSignal extends Signal {
  constructor() {
    super({ id: 'S2', name: 'AUTH_SPF_DKIM_FAIL', severity: 'medium' });
  }

  evaluate(email) {
    const { auth } = email;
    if (!auth.trusted) {
      return this.fire('This email has no sender authentication results from Gmail.');
    }
    const dkimPassed = auth.dkim.some((signature) => signature.result === 'pass');
    if (auth.spf.result === 'pass' || dkimPassed) return null;
    return this.fire('The sending server failed both SPF and DKIM checks.');
  }
}

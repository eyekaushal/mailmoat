import { PolicyRule } from './PolicyRule.js';

/**
 * Sending always needs approval (SECURITY_APPROACH §7.6). Recipients must come from the user;
 * nothing may be sent to someone who is not allowed to read it; nothing derived from a
 * DANGEROUS email is sent at all.
 */
export class SendRule extends PolicyRule {
  constructor() {
    super(['send_email']);
  }

  decide(call, context) {
    const outsider = this.argumentNotFromUser(call, ['to', 'cc']);
    if (outsider) return this.deny(`Recipients in "${outsider}" did not come from you`);
    const recipients = this.addressesIn(call, ['to', 'cc']);
    const leaked = this.contentNotReadableBy(call, ['subject', 'body'], recipients);
    if (leaked) return this.deny(`The ${leaked} contains data not every recipient may see`);
    const level = this.worstLevel(call, context);
    if (level === 'DANGEROUS') return this.deny('The email uses data from a DANGEROUS email');
    return this.ask(
      level === 'SUSPICIOUS'
        ? 'Sending uses data from a SUSPICIOUS email: check it before approving'
        : 'Sending an email needs your approval',
    );
  }
}

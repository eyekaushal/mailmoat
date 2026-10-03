import { PolicyRule } from './PolicyRule.js';

/**
 * Drafts (SECURITY_APPROACH §7.6 `create_draft`): allowed for SAFE sources, approval for
 * SUSPICIOUS, never for DANGEROUS (no compliant reply to BEC). A new draft still obeys the
 * recipient and exfiltration guards, since the user may send it from Gmail without re-reading.
 * `reply` is handled like a send: the user approves the card before the draft exists.
 */
export class DraftRule extends PolicyRule {
  constructor() {
    super(['create_draft', 'reply']);
  }

  decide(call, context) {
    const level = this.worstLevel(call, context);
    if (level === 'DANGEROUS') return this.deny('The source email is DANGEROUS; no reply or draft');
    if (call.tool === 'reply') {
      if (call.args.instructions?.hasSource('email')) {
        return this.deny('Reply instructions came from an email, not from you');
      }
      return this.ask(
        level === 'SUSPICIOUS'
          ? 'Replying to a SUSPICIOUS email: review the draft carefully'
          : 'A reply will be drafted for your review',
      );
    }
    const outsider = this.argumentNotFromUser(call, ['to', 'cc']);
    if (outsider) return this.deny(`Recipients in "${outsider}" did not come from you`);
    const recipients = this.addressesIn(call, ['to', 'cc']);
    const leaked = this.contentNotReadableBy(call, ['subject', 'body'], recipients);
    if (leaked) return this.deny(`The ${leaked} contains data not every recipient may see`);
    if (level === 'SUSPICIOUS') return this.ask('The draft uses data from a SUSPICIOUS email');
    return this.allow(level ? 'Draft from a SAFE email' : 'Draft from your own words');
  }
}

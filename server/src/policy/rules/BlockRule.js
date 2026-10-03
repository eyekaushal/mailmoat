import { PolicyRule } from './PolicyRule.js';

/** Senders whose mail is account security notices; blocking them hides real alerts. */
const NOTIFIER_DOMAINS = Object.freeze([
  'accounts.google.com',
  'google.com',
  'appleid.apple.com',
  'apple.com',
  'account.microsoft.com',
  'microsoft.com',
  'github.com',
]);
const NOTIFIER_LOCAL_PARTS = Object.freeze(['security', 'no-reply', 'noreply', 'account-security']);

/** Blocking needs approval; blocking a security notifier gets an extra warning. */
export class BlockRule extends PolicyRule {
  constructor() {
    super(['block_sender']);
  }

  decide(call) {
    const sender = String(call.args.sender.value).toLowerCase();
    const [local, domain] = sender.split('@');
    const notifier =
      NOTIFIER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`)) &&
      NOTIFIER_LOCAL_PARTS.some(
        (p) => local === p || local.startsWith(`${p}-`) || local.startsWith(`${p}.`),
      );
    return this.ask(
      notifier
        ? 'Warning: this looks like an account security notifier; blocking it hides real alerts'
        : 'Blocking a sender needs your approval',
    );
  }
}

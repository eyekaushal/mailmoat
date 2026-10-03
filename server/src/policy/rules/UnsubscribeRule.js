import { PolicyRule } from './PolicyRule.js';

/**
 * One-click unsubscribe only for SAFE senders with an RFC 8058 HTTPS link (PRD F9.3); a
 * `mailto:` link means sending an email, so it needs approval; anything else is denied and the
 * user is told to report spam or block instead. The sender's risk is that of their latest email.
 */
export class UnsubscribeRule extends PolicyRule {
  #emails;
  #verdicts;

  /**
   * @param {{
   *   emails: Pick<import('../../db/repositories/EmailRepository.js').EmailRepository, 'search'>,
   *   verdicts: Pick<import('../../db/repositories/VerdictRepository.js').VerdictRepository, 'get'>,
   * }} deps
   */
  constructor({ emails, verdicts }) {
    super(['unsubscribe']);
    this.#emails = emails;
    this.#verdicts = verdicts;
  }

  decide(call) {
    const sender = String(call.args.sender.value).toLowerCase();
    const [latest] = this.#emails.search({ from: sender, direction: 'inbound', limit: 1 });
    if (!latest) return this.deny('No email from this sender; nothing to unsubscribe from');
    const level = this.#verdicts.get(latest.gmailId)?.level ?? 'SUSPICIOUS';
    if (level !== 'SAFE') {
      return this.deny(`The sender's latest email is ${level}: report it as spam or block instead`);
    }
    const url = latest.unsubscribeUrl;
    if (!url) return this.deny('The sender offers no unsubscribe link: block instead');
    if (url.toLowerCase().startsWith('mailto:')) {
      return this.ask('Unsubscribing means sending an email to the sender');
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return this.deny('The unsubscribe link is malformed: block instead');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      return this.deny('The unsubscribe link is not a plain HTTPS link: block instead');
    }
    if (!latest.oneClick) return this.deny('No one-click unsubscribe offered: block instead');
    return this.allow('SAFE sender with a one-click HTTPS unsubscribe link');
  }
}

import { TaggedValue } from '../agent/TaggedValue.js';
import { UnsubscribeError } from '../core/errors.js';
import { MimeMessage } from '../google/MimeMessage.js';

const ONE_CLICK_BODY = 'List-Unsubscribe=One-Click';
const ONE_CLICK_HEADERS = Object.freeze({ 'content-type': 'application/x-www-form-urlencoded' });

/**
 * @typedef {'unsubscribe'|'unsubscribe_mail'|'block'|'report_spam'} Method what the page offers
 */

/**
 * Bulk Unsubscribe and Block (PRD F9). The page's buttons all go through the Policy Engine like
 * agent actions: Unsubscribe and Block are `unsubscribe` / `block_sender` tool calls judged by
 * `UnsubscribeRule` / `BlockRule`, and the click is the approval when one is needed. The POST
 * itself happens in `unsubscribe`, which re-checks the sender's risk on its own (defence in
 * depth): a SUSPICIOUS or DANGEROUS sender's link is never contacted.
 */
export class UnsubscribeService {
  #deps;

  /**
   * @param {object} deps
   * @param {Pick<import('./SafeHttpClient.js').SafeHttpClient, 'post'>} deps.http
   * @param {Pick<import('../db/repositories/EmailRepository.js').EmailRepository, 'search'>} deps.emails
   * @param {Pick<import('../db/repositories/VerdictRepository.js').VerdictRepository, 'get'>} deps.verdicts
   * @param {import('../db/repositories/SenderRepository.js').SenderRepository} deps.senders
   * @param {Pick<import('../google/GmailClient.js').GmailClient, 'sendMessage'>} deps.gmail
   * @param {Pick<import('../policy/PolicyEngine.js').PolicyEngine, 'decide'>} deps.policy
   * @param {Pick<import('../actions/ActionExecutor.js').ActionExecutor, 'perform'>} deps.executor
   * @param {Pick<import('../actions/ApprovalService.js').ApprovalService, 'request'|'approve'>} deps.approvals
   * @param {Pick<import('../audit/AuditLog.js').AuditLog, 'record'>} deps.auditLog
   * @param {import('../core/Logger.js').Logger} deps.logger
   * @param {string} deps.timeZone
   * @param {() => Date} [deps.now]
   */
  constructor(deps) {
    this.#deps = { now: () => new Date(), ...deps };
  }

  /**
   * The page listing (F9.1/F9.2): per sender, the numbers and the one safe method offered.
   * @param {{ since?: string, sort?: 'count'|'read', limit?: number }} [filter]
   */
  listSenders(filter) {
    return this.#deps.senders.list(filter).map((sender) => ({
      address: sender.address,
      status: sender.status,
      emailCount: sender.emailCount,
      readCount: sender.readCount,
      readRate: sender.emailCount === 0 ? 0 : sender.readCount / sender.emailCount,
      lastReceived: sender.lastReceived,
      level: sender.latest?.level ?? null,
      method: UnsubscribeService.#method(sender.latest),
    }));
  }

  /** The policy's warning text for blocking this sender, before the user confirms (F9.4). */
  blockWarning(address) {
    const decision = this.#deps.policy.decide(this.#call('block_sender', address));
    return decision.outcome === 'DENY' ? null : decision.reason;
  }

  /**
   * The Unsubscribe button: policy first; a one-click link runs at once, a `mailto:` link is an
   * email the click approves, anything else is refused with the policy's advice.
   * @returns {Promise<{ status: 'UNSUBSCRIBED', method: 'one_click'|'mailto' }>}
   * @throws {UnsubscribeError}
   */
  async requestUnsubscribe(address, { via = 'dashboard' } = {}) {
    const result = await this.#perform('unsubscribe', address, via);
    return { status: result.status, method: result.method };
  }

  /**
   * Performs the unsubscribe for an allowed call (the `unsubscribe` tool's implementation).
   * @param {string} address
   * @returns {Promise<{ status: 'UNSUBSCRIBED', method: 'one_click'|'mailto' }>}
   * @throws {UnsubscribeError} unless the sender is SAFE with a usable link; nothing is contacted otherwise
   */
  async unsubscribe(address) {
    const { http, emails, verdicts, senders, gmail, auditLog, now } = this.#deps;
    const sender = address.toLowerCase();
    const [latest] = emails.search({ from: sender, direction: 'inbound', limit: 1 });
    if (!latest) throw new UnsubscribeError('No email from this sender');
    const level = verdicts.get(latest.gmailId)?.level ?? 'SUSPICIOUS';
    if (level !== 'SAFE') throw new UnsubscribeError(`The sender's latest email is ${level}`);
    const url = latest.unsubscribeUrl;
    if (!url) throw new UnsubscribeError('The sender offers no unsubscribe link');

    let method;
    if (url.toLowerCase().startsWith('mailto:')) {
      const { to, subject } = UnsubscribeService.#mailto(url);
      await gmail.sendMessage({
        raw: MimeMessage.build({ to: [to], subject, body: 'Unsubscribe', date: now() }),
      });
      method = 'mailto';
    } else {
      if (!latest.oneClick) throw new UnsubscribeError('No one-click unsubscribe offered');
      const response = await http.post(url, { body: ONE_CLICK_BODY, headers: ONE_CLICK_HEADERS });
      if (response.status < 200 || response.status >= 300) {
        throw new UnsubscribeError(`The unsubscribe endpoint answered HTTP ${response.status}`);
      }
      method = 'one_click';
    }
    senders.setStatus(sender, 'UNSUBSCRIBED');
    auditLog.record({
      actor: 'user',
      event: 'sender_unsubscribed',
      subject: sender,
      decision: 'UNSUBSCRIBED',
      data: { method, gmailId: latest.gmailId },
    });
    return { status: 'UNSUBSCRIBED', method };
  }

  /**
   * The Block button: `BlockRule` always asks, so the click is the approval.
   * @returns {Promise<{ status: 'BLOCKED', warning: string | null }>}
   */
  async block(address, { via = 'dashboard' } = {}) {
    const result = await this.#perform('block_sender', address, via);
    this.#deps.auditLog.record({
      actor: 'user',
      event: 'sender_blocked',
      subject: address.toLowerCase(),
      decision: 'BLOCKED',
      reason: result.reason,
    });
    return { status: 'BLOCKED', warning: /warning/i.test(result.reason) ? result.reason : null };
  }

  /** Keep = the user approves this sender; it drops out of the suggestions. */
  keep(address) {
    this.#status(address, 'KEPT', 'sender_kept');
    return { status: 'KEPT' };
  }

  /**
   * Undo reverts the status only: an unsubscribe cannot be taken back on the sender's side.
   * @returns {{ status: 'NONE', resubscribed: false, note: string }}
   */
  undo(address) {
    this.#status(address, 'NONE', 'sender_status_reverted');
    return {
      status: 'NONE',
      resubscribed: false,
      note: 'Status reverted. If you had unsubscribed, the sender still has that request.',
    };
  }

  /**
   * Archive all: every stored inbound email from the sender, each through policy and the executor.
   * @returns {Promise<{ archived: number }>}
   */
  async archiveAll(address, { via = 'dashboard' } = {}) {
    const { emails, policy, executor, auditLog, now, timeZone } = this.#deps;
    const sender = address.toLowerCase();
    let archived = 0;
    for (const record of emails.search({ from: sender, direction: 'inbound', limit: 10_000 })) {
      const call = {
        step: 0,
        tool: 'archive',
        args: { email_id: TaggedValue.fromOwnData(record.gmailId, 'inbox') },
        emailIds: [record.gmailId],
      };
      const decision = policy.decide(call);
      if (decision.outcome !== 'ALLOW') throw new UnsubscribeError(decision.reason);
      await executor.perform(call, { now: now(), timeZone }, { approvalId: via });
      archived += 1;
    }
    auditLog.record({
      actor: 'user',
      event: 'sender_archived_all',
      subject: sender,
      data: { archived },
    });
    return { archived };
  }

  /** ALLOW runs now; ASK is approved by the click; DENY is refused with the policy's reason. */
  async #perform(tool, address, via) {
    const { policy, executor, approvals, now, timeZone } = this.#deps;
    const call = this.#call(tool, address);
    const decision = policy.decide(call);
    if (decision.outcome === 'DENY') throw new UnsubscribeError(decision.reason);
    if (decision.outcome === 'ALLOW') {
      const result = await executor.perform(call, { now: now(), timeZone });
      return { ...result.value, reason: decision.reason };
    }
    const { id } = await approvals.request({ call, reason: decision.reason });
    const outcome = await approvals.approve(id, { via, timeZone });
    if (outcome.status !== 'performed') throw new UnsubscribeError(outcome.reason);
    return { ...outcome.result.value, reason: decision.reason };
  }

  #call(tool, address) {
    return {
      step: 0,
      tool,
      args: { sender: TaggedValue.fromUser(address.toLowerCase()) },
      emailIds: [],
    };
  }

  #status(address, status, event) {
    const sender = address.toLowerCase();
    this.#deps.senders.setStatus(sender, status);
    this.#deps.auditLog.record({ actor: 'user', event, subject: sender, decision: status });
  }

  /** @param {{ unsubscribeUrl: string | null, oneClick: boolean, level: string | null } | null} latest */
  static #method(latest) {
    if (!latest) return 'block';
    if (latest.level !== 'SAFE') return 'report_spam';
    const url = latest.unsubscribeUrl ?? '';
    if (url.toLowerCase().startsWith('mailto:')) return 'unsubscribe_mail';
    return url.startsWith('https://') && latest.oneClick ? 'unsubscribe' : 'block';
  }

  static #mailto(url) {
    const parsed = new URL(url);
    const to = decodeURIComponent(parsed.pathname).trim().toLowerCase();
    if (!/^[^\s<>,;"]+@[^\s<>,;"]+$/.test(to)) throw new UnsubscribeError('Malformed mailto link');
    const subject = parsed.searchParams.get('subject')?.trim() || 'Unsubscribe';
    return { to, subject: subject.slice(0, 200) };
  }
}

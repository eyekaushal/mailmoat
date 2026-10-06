import { Router } from 'express';
import {
  DraftReplySchema,
  EmailListQuerySchema,
  GmailIdParamSchema,
  NotPhishingSchema,
  ProposeMeetingSchema,
  SaveMeetingSchema,
  TrustSenderSchema,
} from '@mailmoat/shared/schemas/api';
import { TaggedValue } from '../../agent/TaggedValue.js';
import { NotFoundError } from '../../core/errors.js';
import { Avatar } from '../Avatar.js';
import { validate } from '../validate.js';

/**
 * Inbox (PRD F5, §13): stored metadata, subject, snippet, verdicts and the Reader's typed fields,
 * plus the per-email actions (archive, draft reply, propose/save a meeting, trust, not phishing).
 * Bodies are never stored and never pass through here (the thread route serves the reading
 * view); the Reader summary is AI output of an untrusted email and the UI shows it as plain
 * text, labelled as such.
 */
export class EmailRoutes {
  #deps;

  /**
   * @param {{
   *   emails: import('../../db/repositories/EmailRepository.js').EmailRepository,
   *   verdicts: import('../../db/repositories/VerdictRepository.js').VerdictRepository,
   *   rules: Pick<import('../../db/repositories/RuleRepository.js').RuleRepository, 'runsFor'>,
   *   contacts: Pick<import('../../db/repositories/ContactRepository.js').ContactRepository, 'get'|'setTrusted'>,
   *   audit: Pick<import('../../db/repositories/AuditLogRepository.js').AuditLogRepository, 'recent'>,
   *   policy: Pick<import('../../policy/PolicyEngine.js').PolicyEngine, 'decide'>,
   *   executor: Pick<import('../../actions/ActionExecutor.js').ActionExecutor, 'perform'>,
   *   drafts: Pick<import('../../features/DraftService.js').DraftService, 'createReply'>,
   *   meetings: Pick<import('../../features/MeetingService.js').MeetingService, 'propose'|'save'>,
   *   gmail: Pick<import('../../google/GmailClient.js').GmailClient, 'getRawMessage'>,
   *   ingestor: Pick<import('../../security/ingest/EmailIngestor.js').EmailIngestor, 'ingest'>,
   *   auditLog: Pick<import('../../audit/AuditLog.js').AuditLog, 'record'>,
   *   timeZone: string,
   *   now?: () => Date,
   * }} deps
   */
  constructor(deps) {
    this.#deps = { now: () => new Date(), ...deps };
  }

  router() {
    const { emails, verdicts, rules, contacts, audit, drafts, meetings, auditLog, now } =
      this.#deps;
    const router = Router();

    router.get('/emails', (request, response) => {
      const { label, risk, cursor, limit } = validate(EmailListQuerySchema, request.query);
      const { items, nextCursor } = emails.page({ ruleId: label, level: risk, cursor, limit });
      response.json({
        items: items.map((item) => ({
          ...item,
          avatar: Avatar.for({ name: item.fromName, address: item.fromAddr }),
        })),
        nextCursor,
      });
    });
    router.get('/emails/counts', (_request, response) => response.json(emails.unreadCounts()));

    router.get('/emails/:id', (request, response) => {
      const record = this.#record(request.params);
      const contact = contacts.get(record.fromAddr);
      response.json({
        email: record,
        verdict: verdicts.get(record.gmailId) ?? null,
        readerForm: verdicts.readerForm(record.gmailId) ?? null,
        signals: verdicts.signals(record.gmailId),
        rules: rules.runsFor(record.gmailId),
        sender: {
          trusted: contact?.trusted ?? false,
          sentCount: contact?.sentCount ?? 0,
          receivedCount: contact?.receivedCount ?? 0,
        },
      });
    });

    router.get('/emails/:id/trace', (request, response) => {
      const record = this.#record(request.params);
      const form = verdicts.readerForm(record.gmailId) ?? null;
      response.json({
        gmailId: record.gmailId,
        direction: record.direction,
        auth: verdicts.auth(record.gmailId) ?? null,
        signals: verdicts.signals(record.gmailId),
        reader: { failed: form === null, form },
        verdict: verdicts.get(record.gmailId) ?? null,
        rules: rules.runsFor(record.gmailId),
        events: audit.recent({ subject: record.gmailId, limit: 50 }),
      });
    });

    // The right panel's sender card: who they are, whether the user trusts them, and the newest
    // message of each recent thread from them (a list shape, never the agent's).
    router.get('/emails/:id/sender', (request, response) => {
      const record = this.#record(request.params);
      const contact = contacts.get(record.fromAddr);
      response.json({
        threadId: record.threadId,
        address: record.fromAddr,
        name: record.fromName,
        trusted: contact?.trusted ?? false,
        sentCount: contact?.sentCount ?? 0,
        receivedCount: contact?.receivedCount ?? 0,
        avatar: Avatar.for({ name: record.fromName, address: record.fromAddr }),
        threads: emails.listThreadsFrom(record.fromAddr, 5).map((item) => ({
          threadId: item.threadId,
          gmailId: item.gmailId,
          subject: item.subject,
          date: item.date,
          isRead: item.isRead,
          verdict: item.verdict && { level: item.verdict.level },
        })),
      });
    });

    router.post('/emails/:id/archive', async (request, response) => {
      const record = this.#record(request.params);
      response.json(await this.#organise('archive', record));
    });

    // Opening an email marks it read, in Gmail through the same reversible action the rules use
    // and locally at once, so the unread dot and the tab counts follow the user's reading.
    router.post('/emails/:id/read', async (request, response) => {
      const record = this.#record(request.params);
      const result = await this.#organise('mark_read', record);
      if (result.done) emails.setRead(record.gmailId, true);
      response.json(result);
    });

    router.post('/emails/:id/draft-reply', async (request, response) => {
      const record = this.#record(request.params);
      const { instructions, allowSuspicious } = validate(DraftReplySchema, request.body ?? {});
      const { draftId } = await drafts.createReply({
        gmailId: record.gmailId,
        instructions,
        allowSuspicious,
      });
      response.status(201).json({ gmailId: record.gmailId, draftId });
    });

    router.post('/emails/:id/propose-meeting', async (request, response) => {
      const record = this.#record(request.params);
      const { allowRisky } = validate(ProposeMeetingSchema, request.body ?? {});
      response.json(await meetings.propose({ gmailId: record.gmailId, allowRisky }));
    });

    router.post('/emails/:id/save-meeting', async (request, response) => {
      const record = this.#record(request.params);
      const card = validate(SaveMeetingSchema, request.body);
      response
        .status(201)
        .json(await meetings.save({ gmailId: record.gmailId, ...card }, { via: 'dashboard' }));
    });

    router.post('/emails/:id/trust-sender', (request, response) => {
      const record = this.#record(request.params);
      const { trusted } = validate(TrustSenderSchema, request.body ?? {});
      contacts.setTrusted(record.fromAddr, trusted, now());
      auditLog.record({
        actor: 'user',
        event: trusted ? 'sender_trusted' : 'sender_untrusted',
        subject: record.gmailId,
        data: { address: record.fromAddr },
      });
      response.json({ address: record.fromAddr, trusted });
    });

    router.post('/emails/:id/not-phishing', (request, response) => {
      const record = this.#record(request.params);
      const { notPhishing } = validate(NotPhishingSchema, request.body ?? {});
      const feedback = notPhishing ? 'not_phishing' : null;
      if (!verdicts.setFeedback(record.gmailId, feedback)) {
        throw new NotFoundError('This email has no verdict to give feedback on');
      }
      auditLog.record({
        actor: 'user',
        event: 'verdict_feedback',
        subject: record.gmailId,
        decision: feedback,
      });
      response.json({ gmailId: record.gmailId, verdict: verdicts.get(record.gmailId) });
    });
    return router;
  }

  #record(params) {
    const { id } = validate(GmailIdParamSchema, params);
    const record = this.#deps.emails.get(id);
    if (!record) throw new NotFoundError('Unknown email');
    return record;
  }

  /** A user's click on Archive still goes through the Policy Engine and the one executor. */
  async #organise(tool, record) {
    const { policy, executor, timeZone, now } = this.#deps;
    const call = {
      step: 0,
      tool,
      args: { email_id: TaggedValue.fromUser(record.gmailId) },
      emailIds: [record.gmailId],
    };
    const decision = policy.decide(call);
    if (decision.outcome !== 'ALLOW') {
      return {
        gmailId: record.gmailId,
        done: false,
        decision: decision.outcome,
        reason: decision.reason,
      };
    }
    await executor.perform(call, { now: now(), timeZone });
    return { gmailId: record.gmailId, done: true, decision: 'ALLOW', reason: decision.reason };
  }
}

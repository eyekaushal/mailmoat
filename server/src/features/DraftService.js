import { MAX_SUBJECT_CHARS } from '../agent/tools/CreateDraftTool.js';
import { EmailFacts } from '../agent/EmailFacts.js';
import { DraftError } from '../core/errors.js';
import { MimeMessage } from '../google/MimeMessage.js';

const DEFAULT_RETENTION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const FOOTER = 'Drafted by mailmoat';

/**
 * Formal draft replies (PRD F6). The text comes from the quarantined Drafter; this class decides
 * whether a draft may exist at all (never for DANGEROUS mail, SUSPICIOUS only on explicit
 * request), taints the text to the thread's participants, and saves it as a Gmail draft
 * addressed to the sender only. Nothing is ever sent from here.
 */
export class DraftService {
  #deps;

  /**
   * @param {object} deps
   * @param {Pick<import('../google/GmailClient.js').GmailClient, 'getRawMessage'|'createDraft'|'deleteDraft'>} deps.gmail
   * @param {Pick<import('../security/ingest/EmailIngestor.js').EmailIngestor, 'ingest'>} deps.ingestor
   * @param {Pick<import('../security/reader/Drafter.js').Drafter, 'draft'>} deps.drafter
   * @param {Pick<import('../db/repositories/EmailRepository.js').EmailRepository, 'get'>} deps.emails
   * @param {Pick<import('../db/repositories/VerdictRepository.js').VerdictRepository, 'get'>} deps.verdicts
   * @param {import('../db/repositories/DraftRepository.js').DraftRepository} deps.repository
   * @param {Pick<import('../db/repositories/SettingsRepository.js').SettingsRepository, 'get'>} deps.settings
   * @param {Pick<import('../audit/AuditLog.js').AuditLog, 'record'>} deps.auditLog
   * @param {import('../core/Logger.js').Logger} deps.logger
   * @param {() => Date} [deps.now]
   */
  constructor(deps) {
    this.#deps = { now: () => new Date(), ...deps };
  }

  /**
   * @param {{ gmailId: string, instructions?: string | null, allowSuspicious?: boolean }} input
   *   `allowSuspicious` only when the user asked for this draft themselves (F6.4)
   * @returns {Promise<{ draftId: string, body: import('../agent/TaggedValue.js').TaggedValue }>}
   * @throws {DraftError} when no draft may be created; Drafter and Gmail errors pass through
   */
  async createReply({ gmailId, instructions = null, allowSuspicious = false }) {
    const { gmail, ingestor, drafter, emails, verdicts, repository, settings, auditLog, now } =
      this.#deps;
    const record = emails.get(gmailId);
    if (!record) throw new DraftError('Email not found');
    if (record.direction !== 'inbound') throw new DraftError('Only received email can be answered');
    // No verdict means the pipeline never saw the email: treated as SUSPICIOUS (fail closed).
    const level = verdicts.get(gmailId)?.level ?? 'SUSPICIOUS';
    if (level === 'DANGEROUS') throw new DraftError('No reply is drafted for a DANGEROUS email');
    if (level === 'SUSPICIOUS' && !allowSuspicious) {
      throw new DraftError('A SUSPICIOUS email is only drafted when you ask for it');
    }

    const { raw } = await gmail.getRawMessage(gmailId);
    const email = await ingestor.ingest(raw);
    const userName = settings.get('userName', null);
    const draft = await drafter.draft({ email, instructions, userName });
    const text = DraftService.#clean(draft.body);
    const body = EmailFacts.tag(text, record);
    // Invariant 3 as a gate: the text may only ever travel back to this email's participants.
    if (!body.isReadableBy(record.fromAddr))
      throw new DraftError('Draft is not addressed to the sender');

    const withFooter = settings.get('draftFooter', false) === true ? `${text}\n\n${FOOTER}` : text;
    const mime = MimeMessage.build({
      to: [record.fromAddr],
      subject: DraftService.#replySubject(email.subject),
      body: withFooter,
      inReplyTo: email.messageId,
      date: now(),
    });
    const draftId = await gmail.createDraft({ raw: mime, threadId: record.threadId });
    repository.save({ draftId, gmailId, at: now() });
    auditLog.record({
      actor: allowSuspicious || instructions ? 'user' : 'system',
      event: 'draft_created',
      subject: gmailId,
      decision: level,
      data: { draftId, withInstructions: Boolean(instructions), readers: body.toJSON().readers },
    });
    return { draftId, body };
  }

  /** The dashboard list (F6.3). */
  list(filter) {
    return this.#deps.repository.list(filter);
  }

  /**
   * Deletes unsent mailmoat drafts older than the retention setting (F6.5). A draft the user
   * already sent or removed is simply marked gone.
   * @returns {Promise<{ deleted: number, failed: number }>}
   */
  async pruneStale() {
    const { gmail, repository, settings, auditLog, logger, now } = this.#deps;
    const days = settings.get('draftRetentionDays', DEFAULT_RETENTION_DAYS);
    const before = new Date(now().getTime() - days * DAY_MS);
    const result = { deleted: 0, failed: 0 };
    for (const draft of repository.listStale(before)) {
      try {
        await gmail.deleteDraft(draft.draftId);
      } catch (error) {
        if (!DraftService.#isGone(error)) {
          result.failed += 1;
          logger.warn('stale draft could not be deleted', { draftId: draft.draftId, error });
          continue;
        }
      }
      repository.setStatus(draft.draftId, 'DELETED');
      auditLog.record({
        actor: 'system',
        event: 'draft_deleted',
        subject: draft.gmailId,
        reason: `older than ${days} days`,
        data: { draftId: draft.draftId },
      });
      result.deleted += 1;
    }
    return result;
  }

  /** F6.2: no em or en dashes, whatever the model did. */
  static #clean(text) {
    return text.replace(/\s*[—–]\s*/g, ', ').trim();
  }

  static #replySubject(subject) {
    const base = subject.trim();
    const prefixed = /^re:/i.test(base) ? base : `Re: ${base}`;
    return prefixed.slice(0, MAX_SUBJECT_CHARS) || 'Re:';
  }

  static #isGone(error) {
    return error?.code === 404 || error?.status === 404;
  }
}

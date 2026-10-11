import { MAX_SUBJECT_CHARS } from '../agent/tools/CreateDraftTool.js';
import { EmailFacts } from '../agent/EmailFacts.js';
import { DraftError } from '../core/errors.js';
import { MimeMessage } from '../google/MimeMessage.js';

const DEFAULT_RETENTION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const FOOTER = 'Drafted by mailmoat';

/**
 * Formal draft replies (PRD F6, PLAN §14). The text comes from the quarantined Drafter or from
 * the user; this class decides whether a reply may exist at all (never for DANGEROUS mail,
 * SUSPICIOUS only on explicit request), taints Drafter text to the thread's participants, and
 * saves drafts addressed to the sender only. An email has at most one open mailmoat draft: a
 * new one replaces it (PLAN §16.2 decision 3). Nothing is ever sent from here: sending is a
 * `send_email` approval built from `envelope()`.
 */
export class DraftService {
  #deps;

  /**
   * @param {object} deps
   * @param {Pick<import('../google/GmailClient.js').GmailClient, 'getRawMessage'|'createDraft'|'deleteDraft'|'listDrafts'>} deps.gmail
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
   * The Drafter writes a reply and it is saved to Gmail Drafts at once (Ask AI's `reply` tool).
   * When the email already has an open mailmoat draft, the Drafter revises that text instead
   * ("I didn't like it, make it shorter") and the old draft is replaced.
   * @param {{ gmailId: string, instructions?: string | null, allowSuspicious?: boolean,
   *   tone?: string | null }} input `allowSuspicious` only when the user asked for this draft
   *   themselves (F6.4)
   * @returns {Promise<{ draftId: string, body: import('../agent/TaggedValue.js').TaggedValue }>}
   * @throws {DraftError} when no draft may be created; Drafter and Gmail errors pass through
   */
  async createReply({ gmailId, instructions = null, allowSuspicious = false, tone = null }) {
    const previous = await this.#previous(gmailId);
    const { text, body, record, email, level } = await this.#write({
      gmailId,
      instructions,
      allowSuspicious,
      tone,
      previous: previous?.text ?? null,
      skill: previous ? 'rewrite' : null,
    });
    const draftId = await this.#save({
      record,
      email,
      text,
      body,
      level,
      instructions,
      actor: allowSuspicious || instructions ? 'user' : 'system',
    });
    await this.#replaceOthers(gmailId, draftId);
    return { draftId, body };
  }

  /**
   * The composer's "Draft with AI" (PLAN §14.1 decision 4): the Drafter writes the text and
   * nothing is saved; the user edits it, then saves or sends it for approval.
   * @param {{ gmailId: string, instructions?: string | null, allowSuspicious?: boolean }} input
   * @returns {Promise<{ text: string, body: import('../agent/TaggedValue.js').TaggedValue,
   *   record: object, email: object, level: string }>}
   */
  async compose({ gmailId, instructions = null, allowSuspicious = false }) {
    const written = await this.#write({ gmailId, instructions, allowSuspicious });
    this.#deps.auditLog.record({
      actor: 'user',
      event: 'draft_composed',
      subject: gmailId,
      decision: written.level,
      data: { withInstructions: Boolean(instructions), readers: written.body.toJSON().readers },
    });
    return written;
  }

  /**
   * The draft conversation box (PLAN §16.2 decision 4): the Drafter revises the draft as the user
   * saw it, with one skill from the closed list and the user's words; the result replaces the
   * Gmail draft. Nothing is sent.
   * @param {{ gmailId: string, draftId: string, text: string, skill: string,
   *   instruction?: string | null, tone?: string | null, allowSuspicious?: boolean }} input
   * @returns {Promise<{ draftId: string, text: string }>}
   */
  async revise({
    gmailId,
    draftId,
    text: previous,
    skill,
    instruction = null,
    tone = null,
    allowSuspicious = false,
  }) {
    const { auditLog } = this.#deps;
    const { text, body, record, email, level } = await this.#write({
      gmailId,
      instructions: instruction,
      allowSuspicious,
      tone,
      previous,
      skill,
    });
    const saved = await this.#save({
      record,
      email,
      text,
      body,
      level,
      instructions: instruction,
      actor: 'user',
    });
    await this.discard(draftId);
    await this.#replaceOthers(gmailId, saved);
    auditLog.record({
      actor: 'user',
      event: 'draft_revised',
      subject: gmailId,
      decision: level,
      data: { skill, tone, draftId: saved, replaced: draftId },
    });
    return { draftId: saved, text };
  }

  /** The Drafter's text for this email, tainted to its participants; nothing stored or logged. */
  async #write({
    gmailId,
    instructions,
    allowSuspicious,
    tone = null,
    previous = null,
    skill = null,
  }) {
    const { drafter, settings } = this.#deps;
    const { record, email, level } = await this.#open(gmailId, { allowSuspicious });
    const userName = settings.get('userName', null);
    const draft = await drafter.draft({ email, instructions, userName, previous, skill, tone });
    const text = DraftService.#clean(draft.body);
    const body = EmailFacts.tag(text, record);
    // Invariant 3 as a gate: the text may only ever travel back to this email's participants.
    if (!body.isReadableBy(record.fromAddr))
      throw new DraftError('Draft is not addressed to the sender');
    return { text, body, record, email, level };
  }

  /**
   * The composer's "Save to Drafts": the user's (possibly edited) text as a Gmail draft.
   * @param {{ gmailId: string, text: string, body: import('../agent/TaggedValue.js').TaggedValue,
   *   replacesDraftId?: string | null }} input `body` carries the text's provenance
   * @returns {Promise<{ draftId: string }>}
   */
  async saveReply({ gmailId, text, body, replacesDraftId = null }) {
    const { record, email, level } = await this.#open(gmailId, { allowSuspicious: true });
    if (!body.isReadableBy(record.fromAddr))
      throw new DraftError('Draft is not addressed to the sender');
    const draftId = await this.#save({
      record,
      email,
      text,
      body,
      level,
      instructions: null,
      actor: 'user',
    });
    if (replacesDraftId) await this.discard(replacesDraftId);
    await this.#replaceOthers(gmailId, draftId);
    return { draftId };
  }

  /**
   * The open mailmoat draft for an email, with its text, or null. The text comes from Gmail the
   * way the thread view reads it (draft id → message id → raw → visible text). A draft Gmail no
   * longer has is marked gone.
   * @returns {Promise<{ draftId: string, text: string } | null>}
   */
  async #previous(gmailId) {
    const { gmail, ingestor, repository } = this.#deps;
    const [open] = repository.openFor(gmailId);
    if (!open) return null;
    const draft = (await gmail.listDrafts()).find((item) => item.draftId === open.draftId);
    if (!draft) {
      repository.setStatus(open.draftId, 'DELETED');
      return null;
    }
    const { raw } = await gmail.getRawMessage(draft.messageId);
    const message = await ingestor.ingest(raw);
    return { draftId: open.draftId, text: message.readerText };
  }

  /** One open mailmoat draft per email: every other one is removed once the new one is saved. */
  async #replaceOthers(gmailId, keepDraftId) {
    for (const draft of this.#deps.repository.openFor(gmailId)) {
      if (draft.draftId !== keepDraftId) await this.discard(draft.draftId);
    }
  }

  /**
   * Where a reply to this email goes (PLAN §14.1 decision 5): the sender, the "Re:" subject,
   * the Message-ID and the thread. The approval's `send_email` call is built from this.
   * @param {string} gmailId
   * @returns {Promise<{ to: string, subject: string, inReplyTo: string | null, threadId: string, level: string }>}
   */
  async envelope(gmailId) {
    const { record, email, level } = await this.#open(gmailId, { allowSuspicious: true });
    return {
      to: record.fromAddr,
      subject: DraftService.#replySubject(email.subject),
      inReplyTo: email.messageId ?? null,
      threadId: record.threadId,
      level,
    };
  }

  /**
   * Removes a Gmail draft (the composer's "Delete draft", or a draft a reply was sent from).
   * A draft already gone from Gmail is simply marked gone.
   * @param {string} draftId
   */
  async discard(draftId) {
    const { gmail, repository, auditLog } = this.#deps;
    try {
      await gmail.deleteDraft(draftId);
    } catch (error) {
      if (!DraftService.#isGone(error)) throw error;
    }
    const known = repository.get(draftId);
    if (known) repository.setStatus(draftId, 'DELETED');
    auditLog.record({
      actor: 'user',
      event: 'draft_deleted',
      subject: known?.gmailId ?? null,
      data: { draftId },
    });
  }

  /** Loads the email and decides whether it may be answered at all (F6.4, invariant 6). */
  async #open(gmailId, { allowSuspicious }) {
    const { gmail, ingestor, emails, verdicts } = this.#deps;
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
    return { record, email, level };
  }

  async #save({ record, email, text, body, level, instructions, actor }) {
    const { gmail, repository, settings, auditLog, now } = this.#deps;
    const withFooter = settings.get('draftFooter', false) === true ? `${text}\n\n${FOOTER}` : text;
    const mime = MimeMessage.build({
      to: [record.fromAddr],
      subject: DraftService.#replySubject(email.subject),
      body: withFooter,
      inReplyTo: email.messageId,
      date: now(),
    });
    const draftId = await gmail.createDraft({ raw: mime, threadId: record.threadId });
    repository.save({ draftId, gmailId: record.gmailId, at: now() });
    auditLog.record({
      actor,
      event: 'draft_created',
      subject: record.gmailId,
      decision: level,
      data: { draftId, withInstructions: Boolean(instructions), readers: body.toJSON().readers },
    });
    return draftId;
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

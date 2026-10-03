import { randomUUID } from 'node:crypto';
import { EmailFacts } from '../agent/EmailFacts.js';
import { HandleStore } from '../agent/HandleStore.js';
import { ChatError, PlanError } from '../core/errors.js';

const CONTEXT_DAYS = 7;
const MAX_CONTEXT_EMAILS = 50;
const RECENT_LIMIT = 30;
const TITLE_CHARS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Which of the three v1 intents (F8.1) a plan serves, by the tools it uses. */
const INTENT_TOOLS = {
  write: ['create_draft', 'send_email', 'reply'],
  schedule: ['get_free_busy', 'create_calendar_event'],
  find: ['search_emails', 'get_email_fields', 'extract', 'summarise'],
};

/** Progress text per tool (F8.2). */
const STEP_LABELS = {
  search_emails: 'Searching inbox…',
  get_email_fields: 'Reading email facts…',
  extract: 'Extracting details from the email…',
  summarise: 'Summarising…',
  apply_label: 'Labelling…',
  archive: 'Archiving…',
  mark_read: 'Marking as read…',
  create_draft: 'Drafting…',
  send_email: 'Preparing the email…',
  reply: 'Preparing the reply…',
  get_free_busy: 'Checking calendar…',
  create_calendar_event: 'Preparing the event…',
  unsubscribe: 'Unsubscribing…',
  block_sender: 'Blocking sender…',
  save_memory: 'Saving to memory…',
};

/** How an approval is shown (F8.3). */
const CARD_KINDS = {
  send_email: 'email',
  create_draft: 'email',
  reply: 'reply',
  create_calendar_event: 'event',
  unsubscribe: 'action',
  block_sender: 'action',
};

/**
 * @typedef {{ type: 'status', text: string }
 *   | { type: 'step', step: number, tool: string, label: string, status: 'running'|'done'|'pending'|'denied', reason?: string }
 *   | { type: 'result', step: number, tool: string, value: unknown, untrusted: boolean, sources: object[] }
 *   | { type: 'card', card: Card }
 *   | { type: 'message', text: string }} ChatEvent
 * @typedef {{
 *   approvalId: string, kind: string, tool: string, reason: string,
 *   fields: Record<string, { value: unknown, sources: { type: string, id?: string, from?: string, date?: string }[] }>,
 * }} Card
 * @typedef {{ text: string, intent: 'find'|'write'|'schedule'|'none', status: string, steps: object[], cards: Card[], results: object[] }} AssistantContent
 */

/**
 * The chat panel (PRD F8). A user message is trusted input to the Planner; the Interpreter runs
 * the plan through the Policy Engine; each step streams back as an event; every side effect
 * that needs approval becomes a preview card with its data sources. Nothing is sent, saved or
 * created from here without the user's click on that card.
 */
export class ChatService {
  #deps;

  /**
   * @param {object} deps
   * @param {Pick<import('../agent/Planner.js').Planner, 'plan'>} deps.planner
   * @param {Pick<import('../agent/PlanInterpreter.js').PlanInterpreter, 'run'>} deps.interpreter
   * @param {Pick<import('../actions/ApprovalService.js').ApprovalService, 'get'|'approve'|'reject'>} deps.approvals
   * @param {Pick<import('../db/repositories/EmailRepository.js').EmailRepository, 'get'|'search'>} deps.emails
   * @param {Pick<import('../db/repositories/VerdictRepository.js').VerdictRepository, 'get'|'readerForm'>} deps.verdicts
   * @param {Pick<import('../google/GmailClient.js').GmailClient, 'getRawMessage'>} deps.gmail
   * @param {Pick<import('../security/ingest/EmailIngestor.js').EmailIngestor, 'ingest'>} deps.ingestor
   * @param {import('../db/repositories/ChatRepository.js').ChatRepository} deps.repository
   * @param {Pick<import('../audit/AuditLog.js').AuditLog, 'record'>} deps.auditLog
   * @param {import('../core/Logger.js').Logger} deps.logger
   * @param {string} deps.timeZone
   * @param {() => Date} [deps.now]
   */
  constructor(deps) {
    this.#deps = { now: () => new Date(), ...deps };
  }

  /** @returns {{ id: string, title: string | null, createdAt: string }} */
  create() {
    const { repository, now } = this.#deps;
    const chat = { id: randomUUID(), title: null, at: now() };
    repository.create(chat);
    return { id: chat.id, title: null, createdAt: chat.at.toISOString() };
  }

  list() {
    return this.#deps.repository.list();
  }

  /** @throws {ChatError} */
  messages(chatId) {
    this.#chat(chatId);
    return this.#deps.repository.messages(chatId);
  }

  /** @returns {boolean} */
  delete(chatId) {
    return this.#deps.repository.delete(chatId);
  }

  /**
   * One turn: plan, run, stream, store.
   * @param {{ chatId: string, message: string, emailId?: string | null, onEvent?: (event: ChatEvent) => void }} input
   *   `emailId` = the email the panel was opened from, if any
   * @returns {Promise<AssistantContent>}
   * @throws {ChatError} for an unknown chat; Planner failures become a chat reply, not an error
   */
  async send({ chatId, message, emailId = null, onEvent = () => {} }) {
    const { planner, interpreter, repository, auditLog, timeZone, now } = this.#deps;
    const chat = this.#chat(chatId);
    const text = String(message ?? '').trim();
    if (!text) throw new ChatError('The message is empty');
    const at = now();
    repository.addMessage({ chatId, role: 'user', content: { text }, at });
    if (!chat.title) repository.setTitle(chatId, text.slice(0, TITLE_CHARS));

    const context = this.#context(chatId, emailId);
    const handles = this.#handles(context);
    const content = {
      text: '',
      intent: 'none',
      status: 'completed',
      steps: [],
      cards: [],
      results: [],
    };
    onEvent({ type: 'status', text: 'Planning…' });
    let plan;
    try {
      plan = await planner.plan({ request: text, emails: context, now: at, timeZone });
    } catch (error) {
      if (!(error instanceof PlanError)) throw error;
      content.status = 'failed';
      content.text = `I could not plan that: ${error.message}.`;
      return this.#finish(chatId, content, at, onEvent);
    }

    content.intent = ChatService.#intent(plan);
    content.text = plan.message;
    const run = await interpreter.run(plan, {
      request: text,
      handles,
      now: at,
      timeZone,
      onStep: (event) => this.#onStep(event, content, onEvent),
    });
    content.status = run.status;
    auditLog.record({
      actor: 'user',
      event: 'chat_turn',
      subject: chatId,
      decision: run.status,
      data: { intent: content.intent, steps: run.steps.length, cards: content.cards.length },
    });
    return this.#finish(chatId, content, at, onEvent);
  }

  /**
   * The card's Send / Save / Reject button (F8.3), recorded in the chat.
   * @param {{ chatId: string, approvalId: string, action: 'approve'|'reject' }} input
   * @returns {Promise<{ status: 'performed'|'denied'|'rejected', text: string }>}
   */
  async decide({ chatId, approvalId, action }) {
    const { approvals, repository, timeZone, now } = this.#deps;
    this.#chat(chatId);
    const approval = approvals.get(approvalId);
    if (!approval) throw new ChatError('Unknown approval');
    let outcome;
    if (action === 'approve') {
      const result = await approvals.approve(approvalId, { via: 'chat', timeZone });
      outcome =
        result.status === 'performed'
          ? { status: 'performed', text: `Done: ${ChatService.#pastTense(approval.tool)}.` }
          : { status: 'denied', text: `Not done: ${result.reason}` };
    } else if (action === 'reject') {
      approvals.reject(approvalId, { via: 'chat' });
      outcome = { status: 'rejected', text: 'Discarded.' };
    } else {
      throw new ChatError(`Unknown action: ${action}`);
    }
    repository.addMessage({
      chatId,
      role: 'assistant',
      content: { ...outcome, approvalId, intent: 'none', steps: [], cards: [], results: [] },
      at: now(),
    });
    return outcome;
  }

  #chat(chatId) {
    const chat = this.#deps.repository.get(chatId);
    if (!chat) throw new ChatError('Unknown chat');
    return chat;
  }

  /**
   * Emails the Planner may refer to, as typed facts: the email the panel was opened from, emails
   * earlier turns of this chat surfaced, then the last week's mail, newest first.
   */
  #context(chatId, emailId) {
    const { emails, verdicts, repository, now } = this.#deps;
    const ids = [];
    if (emailId) ids.push(emailId);
    for (const message of repository.messages(chatId)) {
      if (message.role !== 'assistant') continue;
      for (const result of message.content.results ?? []) {
        for (const source of result.sources ?? []) if (source.type === 'email') ids.push(source.id);
      }
    }
    const since = new Date(now().getTime() - CONTEXT_DAYS * DAY_MS).toISOString();
    for (const record of emails.search({ since, limit: RECENT_LIMIT })) ids.push(record.gmailId);

    const context = [];
    for (const id of new Set(ids)) {
      const record = emails.get(id);
      if (!record) continue;
      context.push({
        record,
        form: verdicts.readerForm(id) ?? null,
        verdict: verdicts.get(id) ?? null,
      });
      if (context.length === MAX_CONTEXT_EMAILS) break;
    }
    return context;
  }

  /** Summaries from the stored Reader form; bodies fetched and ingested only when a step needs them. */
  #handles(context) {
    const { gmail, ingestor } = this.#deps;
    const handles = new HandleStore();
    for (const { record, form } of context) {
      const id = record.gmailId;
      if (form) {
        handles.register(
          HandleStore.emailHandle(id, 'summary'),
          EmailFacts.tag(form.summary, record),
        );
      }
      handles.register(HandleStore.emailHandle(id, 'body'), async () => {
        const { raw } = await gmail.getRawMessage(id);
        const email = await ingestor.ingest(raw);
        return EmailFacts.tag(email.readerText, record);
      });
    }
    return handles;
  }

  #onStep(event, content, onEvent) {
    const label = STEP_LABELS[event.tool] ?? `${event.tool}…`;
    if (event.phase === 'start') {
      onEvent({ type: 'step', step: event.step, tool: event.tool, label, status: 'running' });
      return;
    }
    const status = { ALLOW: 'done', ASK: 'pending', DENY: 'denied' }[event.decision];
    const step = { step: event.step, tool: event.tool, label, status, reason: event.reason };
    content.steps.push(step);
    onEvent({ type: 'step', ...step });
    if (event.result) {
      const { value, sources } = event.result.toJSON();
      // F8.7: anything with an email source is untrusted text and is shown as such.
      const result = {
        step: event.step,
        tool: event.tool,
        value,
        sources,
        untrusted: sources.some((source) => source.type === 'email'),
      };
      content.results.push(result);
      onEvent({ type: 'result', ...result });
    }
    if (event.approvalId) {
      const card = this.#card(event.approvalId);
      content.cards.push(card);
      onEvent({ type: 'card', card });
    }
  }

  /** The preview (F8.3) with every value's data sources spelled out (F8.4). */
  #card(approvalId) {
    const { approvals, emails } = this.#deps;
    const approval = approvals.get(approvalId);
    const describe = (source) => {
      if (source.type !== 'email') return source;
      const record = emails.get(source.id);
      return record ? { ...source, from: record.fromAddr, date: record.date } : source;
    };
    return {
      approvalId,
      kind: CARD_KINDS[approval.tool] ?? 'action',
      tool: approval.tool,
      reason: approval.reason,
      fields: Object.fromEntries(
        Object.entries(approval.args).map(([name, arg]) => [
          name,
          { value: arg.value, sources: arg.sources.map(describe) },
        ]),
      ),
    };
  }

  #finish(chatId, content, at, onEvent) {
    this.#deps.repository.addMessage({ chatId, role: 'assistant', content, at });
    onEvent({ type: 'message', text: content.text });
    return content;
  }

  static #intent(plan) {
    const tools = new Set(plan.steps.map((step) => step.tool));
    for (const [intent, names] of Object.entries(INTENT_TOOLS)) {
      if (names.some((name) => tools.has(name))) return intent;
    }
    return 'none';
  }

  static #pastTense(tool) {
    return (
      {
        send_email: 'email sent',
        create_draft: 'draft saved',
        reply: 'reply drafted',
        create_calendar_event: 'event created and invitations sent',
        unsubscribe: 'unsubscribed',
        block_sender: 'sender blocked',
      }[tool] ?? `${tool} performed`
    );
  }
}

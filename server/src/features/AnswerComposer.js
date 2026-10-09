/**
 * The one line Ask AI says after a plan ran (PLAN §15.1 decision 4), composed in code from typed
 * results: counts, sender addresses, times. Never model text, never email text. The Planner's own
 * message is the progress line while the plan runs; this is what stays.
 */
export class AnswerComposer {
  #timeZone;

  /** @param {{ timeZone: string }} deps */
  constructor({ timeZone }) {
    this.#timeZone = timeZone;
  }

  /**
   * @param {{ status: string, planMessage: string, steps: { tool: string, status: string, reason?: string }[],
   *   results: { tool: string, kind: string, value: unknown }[], cards: { kind: string, tool: string }[],
   *   query?: { sender?: string | null, needsReply?: boolean } }} turn
   * @returns {string}
   */
  compose({ status, planMessage, steps, results, cards, query = {} }) {
    if (status === 'failed') return planMessage;
    if (steps.length === 0) return planMessage || 'Nothing to do.';
    const denied = steps.find((step) => step.status === 'denied');
    if (denied && cards.length === 0) return `Not done: ${denied.reason}`;

    const lines = [];
    const emails = results.find((result) => result.kind === 'emails');
    if (emails) lines.push(this.#emails(emails.value, query));
    if (results.some((result) => result.kind === 'summary') && !emails)
      lines.push(query.sender ? `Here is what ${query.sender} wrote.` : 'Here is the summary.');
    for (const card of cards) lines.push(AnswerComposer.#card(card));
    if (lines.length === 0)
      lines.push(status === 'pending' ? 'Waiting for your approval.' : 'Done.');
    return lines.filter(Boolean).join(' ');
  }

  /**
   * The line under a card once its button was clicked (F8.3).
   * @param {{ tool: string, args: Record<string, { value: unknown }> }} approval
   * @param {'performed'|'denied'|'rejected'} status
   * @param {string} [reason]
   */
  decided(approval, status, reason) {
    if (status === 'rejected') return 'Discarded.';
    if (status === 'denied') return `Not done: ${reason}`;
    switch (approval.tool) {
      case 'create_calendar_event': {
        const start = approval.args.start?.value;
        const end = approval.args.end?.value;
        return start
          ? `Done! Your meeting is scheduled for ${this.#when(start, end)}.`
          : 'Done! Your meeting is scheduled.';
      }
      case 'send_email':
        return 'Done! Your email is on its way.';
      case 'create_draft':
      case 'reply':
        return 'Saved to Gmail Drafts. Nothing is sent until you approve it.';
      case 'unsubscribe':
        return 'Done! Unsubscribed.';
      case 'block_sender':
        return 'Done! Sender blocked; future mail is archived.';
      default:
        return 'Done.';
    }
  }

  #emails(value, query) {
    const count = value?.count ?? 0;
    const who = query.sender ? ` from ${query.sender}` : '';
    if (count === 0) {
      return query.needsReply
        ? 'Nothing needs a reply right now.'
        : `Nothing${who} in the last 15 days.`;
    }
    const noun = count === 1 ? 'email' : 'emails';
    let line = query.needsReply
      ? `${count} ${noun} ${count === 1 ? 'needs' : 'need'} a reply.`
      : `${count} ${noun}${who}.`;
    const senders = value.senders ?? [];
    if (query.sender && senders.length > 1 && !query.sender.includes('@')) {
      line += ` ${senders.length} senders match “${query.sender}”; check the addresses.`;
    }
    return line;
  }

  static #card(card) {
    switch (card.kind) {
      case 'event':
        return 'Here is the event. Save it when it looks right.';
      case 'reply':
        return 'Draft ready. Read it before you save it.';
      case 'email':
        return card.tool === 'send_email'
          ? 'Ready to send. Approve it on the Approvals page.'
          : 'Draft ready. Read it before you save it.';
      default:
        return 'This needs your approval.';
    }
  }

  #when(start, end) {
    const day = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: this.#timeZone,
    });
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: this.#timeZone,
    });
    const from = new Date(start);
    const text = `${day.format(from)}, ${time.format(from)}`;
    return end ? `${text} to ${time.format(new Date(end))}` : text;
  }
}

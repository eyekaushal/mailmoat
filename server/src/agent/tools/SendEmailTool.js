import { z } from 'zod';
import { MimeMessage } from '../../google/MimeMessage.js';
import { TaggedValue } from '../TaggedValue.js';
import { OutgoingEmailArgs } from './CreateDraftTool.js';
import { Tool } from './Tool.js';

/**
 * Sends a plain-text email. Always an approval (ASK) in policy. A reply from the composer
 * (PLAN §14) carries the thread it answers and, when it started from a Gmail draft, that draft,
 * which is removed once the mail is sent.
 */
export class SendEmailTool extends Tool {
  #gmail;
  #drafts;

  /**
   * @param {{
   *   gmail: Pick<import('../../google/GmailClient.js').GmailClient, 'sendMessage'>,
   *   drafts?: { discard(draftId: string): Promise<void> },
   * }} deps
   */
  constructor({ gmail, drafts = null }) {
    super({
      name: 'send_email',
      description:
        'Send a new email after the user approves it. Recipients must be addresses the user typed.',
      args: OutgoingEmailArgs.extend({
        in_reply_to: z.string().max(998).optional().describe('Message-ID being answered.'),
        thread_id: z.string().max(64).optional().describe('Gmail thread the reply belongs to.'),
        draft_id: z.string().max(64).optional().describe('Gmail draft this reply started from.'),
      }),
    });
    this.#gmail = gmail;
    this.#drafts = drafts;
  }

  async execute(args, { now }) {
    const raw = MimeMessage.build({
      to: args.to.value,
      cc: args.cc?.value ?? [],
      subject: args.subject.value,
      body: args.body.value,
      inReplyTo: args.in_reply_to?.value ?? null,
      date: now,
    });
    const messageId = await this.#gmail.sendMessage({ raw, threadId: args.thread_id?.value });
    if (args.draft_id?.value && this.#drafts) await this.#drafts.discard(args.draft_id.value);
    return TaggedValue.fromOwnData({ messageId }, 'inbox');
  }
}

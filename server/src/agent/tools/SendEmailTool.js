import { MimeMessage } from '../../google/MimeMessage.js';
import { TaggedValue } from '../TaggedValue.js';
import { OutgoingEmailArgs } from './CreateDraftTool.js';
import { Tool } from './Tool.js';

/** Sends a new plain-text email. Always an approval (ASK) in policy. */
export class SendEmailTool extends Tool {
  #gmail;

  /** @param {{ gmail: Pick<import('../../google/GmailClient.js').GmailClient, 'sendMessage'> }} deps */
  constructor({ gmail }) {
    super({
      name: 'send_email',
      description:
        'Send a new email after the user approves it. Recipients must be addresses the user typed.',
      args: OutgoingEmailArgs,
    });
    this.#gmail = gmail;
  }

  async execute(args, { now }) {
    const raw = MimeMessage.build({
      to: args.to.value,
      cc: args.cc?.value ?? [],
      subject: args.subject.value,
      body: args.body.value,
      date: now,
    });
    const messageId = await this.#gmail.sendMessage({ raw });
    return TaggedValue.fromOwnData({ messageId }, 'inbox');
  }
}

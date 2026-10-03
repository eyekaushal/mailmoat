import { z } from 'zod';
import { MimeMessage } from '../../google/MimeMessage.js';
import { TaggedValue } from '../TaggedValue.js';
import { Tool } from './Tool.js';

export const MAX_RECIPIENTS = 20;
export const MAX_SUBJECT_CHARS = 200;
export const MAX_BODY_CHARS = 4_000;

/** Argument shape shared with `send_email`, so both are policed on the same fields. */
export const OutgoingEmailArgs = z.strictObject({
  to: z.array(z.email()).min(1).max(MAX_RECIPIENTS).describe('Recipient addresses the user gave.'),
  cc: z.array(z.email()).max(MAX_RECIPIENTS).optional().describe('Cc addresses the user gave.'),
  subject: z.string().trim().min(1).max(MAX_SUBJECT_CHARS).describe('Subject line.'),
  body: z
    .string()
    .trim()
    .min(1)
    .max(MAX_BODY_CHARS)
    .describe("Plain-text body in the user's words."),
});

/** Saves a new plain-text email as a Gmail draft. Nothing is sent. */
export class CreateDraftTool extends Tool {
  #gmail;

  /** @param {{ gmail: Pick<import('../../google/GmailClient.js').GmailClient, 'createDraft'> }} deps */
  constructor({ gmail }) {
    super({
      name: 'create_draft',
      description:
        'Save a new email as a Gmail draft for the user to review. Use "reply" to answer an existing email.',
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
    const draftId = await this.#gmail.createDraft({ raw });
    return TaggedValue.fromOwnData({ draftId }, 'inbox');
  }
}

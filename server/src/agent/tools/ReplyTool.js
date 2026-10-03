import { z } from 'zod';
import { ToolError } from '../../core/errors.js';
import { EmailFacts } from '../EmailFacts.js';
import { Tool } from './Tool.js';

const MAX_INSTRUCTION_CHARS = 1_000;

/**
 * Drafts a reply to an email. The text is written by the quarantined Drafter (PRD F6.1), which
 * reads the thread; the Planner only names the email and relays the user's instructions.
 */
export class ReplyTool extends Tool {
  #emails;
  #drafts;

  /**
   * @param {{
   *   emails: Pick<import('../../db/repositories/EmailRepository.js').EmailRepository, 'get'>,
   *   drafts: { createReply(input: { gmailId: string, instructions: string | null }): Promise<{ draftId: string }> },
   * }} deps `drafts` is the DraftService (B19)
   */
  constructor({ emails, drafts }) {
    super({
      name: 'reply',
      description:
        "Draft a reply to an email. A quarantined writer composes the text from the thread and the user's instructions; the draft is saved for review.",
      args: z.strictObject({
        email_id: z.string().min(1).describe('The id of the email to answer.'),
        instructions: z
          .string()
          .trim()
          .min(1)
          .max(MAX_INSTRUCTION_CHARS)
          .optional()
          .describe("What the user wants the reply to say, in the user's words."),
      }),
    });
    this.#emails = emails;
    this.#drafts = drafts;
  }

  async execute(args) {
    const record = this.#emails.get(args.email_id.value);
    if (!record) throw new ToolError('Email not found');
    const { draftId } = await this.#drafts.createReply({
      gmailId: record.gmailId,
      instructions: args.instructions?.value ?? null,
    });
    return EmailFacts.tag({ draftId }, record);
  }
}

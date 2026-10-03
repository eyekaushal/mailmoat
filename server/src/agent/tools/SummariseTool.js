import { z } from 'zod';
import { ToolError } from '../../core/errors.js';
import { EmailFacts } from '../EmailFacts.js';
import { Tool } from './Tool.js';

/** The Reader's summary of one email, for showing to the user (plain text, marked untrusted). */
export class SummariseTool extends Tool {
  #emails;
  #verdicts;

  /**
   * @param {{
   *   emails: Pick<import('../../db/repositories/EmailRepository.js').EmailRepository, 'get'>,
   *   verdicts: Pick<import('../../db/repositories/VerdictRepository.js').VerdictRepository, 'readerForm'>,
   * }} deps
   */
  constructor({ emails, verdicts }) {
    super({
      name: 'summarise',
      description: 'Show the user a short, quarantined summary of one email.',
      args: z.strictObject({
        email_id: z.string().min(1).describe('The id of an email in context.'),
      }),
    });
    this.#emails = emails;
    this.#verdicts = verdicts;
  }

  async execute(args) {
    const id = args.email_id.value;
    const record = this.#emails.get(id);
    const form = record && this.#verdicts.readerForm(id);
    if (!form) throw new ToolError('No summary available for this email');
    return EmailFacts.tag({ summary: form.summary }, record);
  }
}

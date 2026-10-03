import { z } from 'zod';
import { ToolError } from '../../core/errors.js';
import { EmailFacts } from '../EmailFacts.js';
import { Tool } from './Tool.js';

/** Typed facts about one email, tagged to that email and its participants. */
export class GetEmailFieldsTool extends Tool {
  #emails;
  #verdicts;

  /**
   * @param {{
   *   emails: Pick<import('../../db/repositories/EmailRepository.js').EmailRepository, 'get'>,
   *   verdicts: Pick<import('../../db/repositories/VerdictRepository.js').VerdictRepository, 'get'|'readerForm'>,
   * }} deps
   */
  constructor({ emails, verdicts }) {
    super({
      name: 'get_email_fields',
      description:
        'Typed facts about one email: sender, time, risk, category, request types and proposed meeting times. Never its text.',
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
    if (!record) throw new ToolError('Email not found');
    const facts = EmailFacts.from({
      record,
      form: this.#verdicts.readerForm(id) ?? null,
      verdict: this.#verdicts.get(id) ?? null,
    });
    return EmailFacts.tag(facts, record);
  }
}

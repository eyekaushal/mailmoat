import { z } from 'zod';
import { TaggedValue } from '../TaggedValue.js';
import { Tool } from './Tool.js';

/** Adds a Gmail label (reversible). Security labels under `mailmoat/` are code-only. */
export class ApplyLabelTool extends Tool {
  #gmail;

  /** @param {{ gmail: Pick<import('../../google/GmailClient.js').GmailClient, 'ensureLabel'|'modifyLabels'> }} deps */
  constructor({ gmail }) {
    super({
      name: 'apply_label',
      description: 'Add a Gmail label to an email, creating the label if needed.',
      args: z.strictObject({
        email_id: z.string().min(1).describe('The id of the email.'),
        label: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .refine((name) => !name.toLowerCase().startsWith('mailmoat/'), 'reserved')
          .describe('Label name, e.g. "Receipts". Names under "mailmoat/" are reserved.'),
      }),
    });
    this.#gmail = gmail;
  }

  async execute(args) {
    const labelId = await this.#gmail.ensureLabel(args.label.value);
    await this.#gmail.modifyLabels(args.email_id.value, { add: [labelId] });
    return TaggedValue.fromOwnData({ labelled: true }, 'inbox');
  }
}

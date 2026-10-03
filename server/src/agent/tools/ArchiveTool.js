import { z } from 'zod';
import { TaggedValue } from '../TaggedValue.js';
import { Tool } from './Tool.js';

/** Removes an email from the inbox (reversible). */
export class ArchiveTool extends Tool {
  #gmail;

  /** @param {{ gmail: Pick<import('../../google/GmailClient.js').GmailClient, 'archive'> }} deps */
  constructor({ gmail }) {
    super({
      name: 'archive',
      description: 'Archive an email (remove it from the inbox; it stays searchable).',
      args: z.strictObject({ email_id: z.string().min(1).describe('The id of the email.') }),
    });
    this.#gmail = gmail;
  }

  async execute(args) {
    await this.#gmail.archive(args.email_id.value);
    return TaggedValue.fromOwnData({ archived: true }, 'inbox');
  }
}

import { z } from 'zod';
import { TaggedValue } from '../TaggedValue.js';
import { Tool } from './Tool.js';

/** Marks an email read (reversible). */
export class MarkReadTool extends Tool {
  #gmail;

  /** @param {{ gmail: Pick<import('../../google/GmailClient.js').GmailClient, 'modifyLabels'> }} deps */
  constructor({ gmail }) {
    super({
      name: 'mark_read',
      description: 'Mark an email as read.',
      args: z.strictObject({ email_id: z.string().min(1).describe('The id of the email.') }),
    });
    this.#gmail = gmail;
  }

  async execute(args) {
    await this.#gmail.modifyLabels(args.email_id.value, { remove: ['UNREAD'] });
    return TaggedValue.fromOwnData({ read: true }, 'inbox');
  }
}

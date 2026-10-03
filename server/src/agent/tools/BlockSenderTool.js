import { z } from 'zod';
import { TaggedValue } from '../TaggedValue.js';
import { Tool } from './Tool.js';

/** Marks a sender BLOCKED; future mail from them is labelled and archived by the sync. */
export class BlockSenderTool extends Tool {
  #senders;

  /** @param {{ senders: Pick<import('../../db/repositories/SenderRepository.js').SenderRepository, 'setStatus'> }} deps */
  constructor({ senders }) {
    super({
      name: 'block_sender',
      description: 'Block a sender: future emails from this address are archived automatically.',
      args: z.strictObject({ sender: z.email().describe('The sender address.') }),
    });
    this.#senders = senders;
  }

  async execute(args) {
    this.#senders.setStatus(args.sender.value, 'BLOCKED');
    return TaggedValue.fromOwnData({ blocked: true }, 'inbox');
  }
}

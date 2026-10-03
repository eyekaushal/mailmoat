import { z } from 'zod';
import { TaggedValue } from '../TaggedValue.js';
import { Tool } from './Tool.js';

/** One-click unsubscribe from a sender, through the SSRF-checked UnsubscribeService (B22). */
export class UnsubscribeTool extends Tool {
  #unsubscribes;

  /** @param {{ unsubscribes: { unsubscribe(address: string): Promise<{ status: string, method?: string }> } }} deps */
  constructor({ unsubscribes }) {
    super({
      name: 'unsubscribe',
      description: 'Unsubscribe from a newsletter or marketing sender using its one-click link.',
      args: z.strictObject({ sender: z.email().describe('The sender address.') }),
    });
    this.#unsubscribes = unsubscribes;
  }

  async execute(args) {
    const result = await this.#unsubscribes.unsubscribe(args.sender.value);
    return TaggedValue.fromOwnData(
      { status: result.status, method: result.method ?? null },
      'inbox',
    );
  }
}

import { z } from 'zod';
import { TaggedValue } from '../TaggedValue.js';
import { Tool } from './Tool.js';

const MAX_MEMORY_CHARS = 500;

/** Remembers something the user said. Policy allows it only for user-sourced content. */
export class SaveMemoryTool extends Tool {
  #memory;

  /** @param {{ memory: { add(entry: { content: string, source: 'user' }): { id: number } } }} deps */
  constructor({ memory }) {
    super({
      name: 'save_memory',
      description:
        "Remember a fact the user explicitly asked to remember, in the user's own words.",
      args: z.strictObject({
        content: z
          .string()
          .trim()
          .min(1)
          .max(MAX_MEMORY_CHARS)
          .describe("The user's words to remember."),
      }),
    });
    this.#memory = memory;
  }

  async execute(args) {
    const { id } = this.#memory.add({ content: args.content.value, source: 'user' });
    return TaggedValue.fromOwnData({ memoryId: id }, 'memory');
  }
}

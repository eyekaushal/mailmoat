import { PLAN_TOOLS } from '@mailmoat/shared/schemas/plan';
import { ConfigError, ToolError } from '../../core/errors.js';

/** The tools the interpreter may run, by name; also produces the Planner's catalogue. */
export class ToolRegistry {
  #tools = new Map();

  /** @param {import('./Tool.js').Tool[]} tools */
  constructor(tools) {
    for (const tool of tools) {
      if (!PLAN_TOOLS.includes(tool.name)) throw new ConfigError(`Not a v1 tool: ${tool.name}`);
      if (this.#tools.has(tool.name)) throw new ConfigError(`Duplicate tool: ${tool.name}`);
      this.#tools.set(tool.name, tool);
    }
  }

  /**
   * @param {string} name
   * @returns {import('./Tool.js').Tool}
   * @throws {ToolError} for a tool that is not registered
   */
  get(name) {
    const tool = this.#tools.get(name);
    if (!tool) throw new ToolError(`Unknown tool: ${name}`);
    return tool;
  }

  /** @returns {string[]} */
  names() {
    return [...this.#tools.keys()];
  }

  /** @returns {ReturnType<import('./Tool.js').Tool['describe']>[]} */
  catalogue() {
    return [...this.#tools.values()].map((tool) => tool.describe());
  }
}

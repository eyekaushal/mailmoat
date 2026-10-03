import { z } from 'zod';
import { ToolError } from '../../core/errors.js';

/**
 * @typedef {Record<string, import('../TaggedValue.js').TaggedValue>} TaggedArgs
 * @typedef {{ now: Date, timeZone: string }} ToolContext trusted facts for this run
 * @typedef {{ name: string, type: string, description: string, required: boolean }} ArgDescription
 */

/**
 * Base class for the agent's tools (PRD F12.6). A tool declares its arguments as a strict Zod
 * object (every field described, no defaults) and does one thing in `execute`. It never decides
 * whether it may run: the interpreter asks the Policy Engine first, and only hands over
 * arguments that passed `parseArgs`.
 */
export class Tool {
  /**
   * @param {{ name: string, description: string, args: z.ZodObject }} definition
   */
  constructor({ name, description, args }) {
    this.name = name;
    this.description = description;
    this.argsSchema = args;
  }

  /** The entry the Planner sees in its catalogue; the only place a tool describes itself. */
  describe() {
    const json = z.toJSONSchema(this.argsSchema);
    const required = new Set(json.required ?? []);
    return {
      name: this.name,
      description: this.description,
      args: Object.entries(json.properties ?? {}).map(([name, prop]) => ({
        name,
        type: Tool.#typeLabel(prop),
        description: prop.description ?? name,
        required: required.has(name),
      })),
    };
  }

  /**
   * @param {Record<string, unknown>} raw argument values
   * @returns {Record<string, unknown>} validated values
   * @throws {ToolError} naming only the failing paths, never the values
   */
  parseArgs(raw) {
    const parsed = this.argsSchema.safeParse(raw);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join('.') || '(root)');
      throw new ToolError(`Invalid arguments for ${this.name}: ${paths.join(', ')}`);
    }
    return parsed.data;
  }

  /**
   * @param {TaggedArgs} _args validated, tagged
   * @param {ToolContext} _context
   * @returns {Promise<import('../TaggedValue.js').TaggedValue>}
   */
  async execute(_args, _context) {
    throw new ToolError(`${this.name} is not implemented`);
  }

  static #typeLabel(prop) {
    if (prop.enum) return `one of ${prop.enum.map((v) => `"${v}"`).join(', ')}`;
    if (prop.anyOf) return prop.anyOf.map((p) => Tool.#typeLabel(p)).join(' or ');
    if (prop.type === 'array') return `list of ${Tool.#typeLabel(prop.items ?? {})}`;
    return prop.type ?? 'value';
  }
}

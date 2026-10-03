import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { ARG_NAME_PATTERN, PLAN_TOOLS, PlanSchema } from '@mailmoat/shared/schemas/plan';
import { ConfigError, LlmError, LlmRefusalError, PlanError } from '../core/errors.js';
import { EmailFacts } from './EmailFacts.js';

const SYSTEM_PROMPT = readFileSync(new URL('./prompts/planner.system.md', import.meta.url), 'utf8');
const MAX_REQUEST_CHARS = 4_000;
const MAX_EMAILS = 50;

const CatalogueSchema = z
  .array(
    z.strictObject({
      name: z.enum(PLAN_TOOLS),
      description: z.string().min(1),
      args: z.array(
        z.strictObject({
          name: z.string().regex(ARG_NAME_PATTERN),
          type: z.string().min(1),
          description: z.string().min(1),
          required: z.boolean(),
        }),
      ),
    }),
  )
  .min(1);

/**
 * @typedef {{ name: string, description: string, args: { name: string, type: string, description: string, required: boolean }[] }} ToolDescription
 * @typedef {import('./EmailFacts.js').StoredEmail} PlannerEmail
 * @typedef {{ tool: string, args: Record<string, import('@mailmoat/shared/schemas/plan').PlanArgValue> }} PlanStep
 * @typedef {{ message: string, steps: PlanStep[] }} Plan
 */

/**
 * Layer 5: the privileged AI. It receives the user's request, the tool catalogue and typed facts
 * about emails, and returns a schema-checked plan. It never receives email text: not the body,
 * subject, display name, summary or claimed brand. Text is reachable only through handles.
 *
 * Any failure throws a `PlanError`, and a plan that was not returned never runs.
 */
export class Planner {
  #llm;
  #tools;
  #auditLog;
  #logger;
  #system;

  /**
   * @param {{
   *   llm: Pick<import('../llm/LlmClient.js').LlmClient, 'complete'>,
   *   tools: ToolDescription[] the catalogue the model may plan with
   *   auditLog: Pick<import('../audit/AuditLog.js').AuditLog, 'record'>,
   *   logger: import('../core/Logger.js').Logger,
   * }} deps
   */
  constructor({ llm, tools, auditLog, logger }) {
    const parsed = CatalogueSchema.safeParse(tools);
    if (!parsed.success) throw new ConfigError(`Invalid tool catalogue: ${parsed.error.message}`);
    const names = parsed.data.map((tool) => tool.name);
    if (new Set(names).size !== names.length) throw new ConfigError('Duplicate tool in catalogue');
    this.#llm = llm;
    this.#tools = new Map(parsed.data.map((tool) => [tool.name, tool]));
    this.#auditLog = auditLog;
    this.#logger = logger;
    this.#system = `${SYSTEM_PROMPT}\n\n# Tools\n\n${this.#renderCatalogue(parsed.data)}`;
  }

  /**
   * @param {{ request: string, emails?: PlannerEmail[], now: Date, timeZone: string }} input
   *   `request` is the user's own words (trusted); `emails` are the emails in context
   * @returns {Promise<Plan>}
   * @throws {PlanError}
   */
  async plan({ request, emails = [], now, timeZone }) {
    const facts = this.#facts(emails);
    const user = this.#userMessage(this.#request(request), facts, now, timeZone);
    let output;
    try {
      output = await this.#llm.complete({
        role: 'planner',
        system: this.#system,
        user,
        schema: PlanSchema,
      });
    } catch (error) {
      this.#logger.warn('Planner call failed; nothing will run', { error: error.name });
      if (error instanceof LlmRefusalError) {
        throw new PlanError('The Planner declined this request', { cause: error });
      }
      if (error instanceof LlmError) {
        throw new PlanError('The Planner could not produce a plan', { cause: error });
      }
      throw error;
    }
    const plan = this.#checkAgainstCatalogue(output);
    this.#auditLog.record({
      actor: 'planner',
      event: 'plan_created',
      data: { emailIds: facts.map((fact) => fact.id), plan },
    });
    return plan;
  }

  #request(request) {
    const parsed = z.string().trim().min(1).max(MAX_REQUEST_CHARS).safeParse(request);
    if (!parsed.success) throw new PlanError('The request is empty or too long');
    return parsed.data;
  }

  /** Whitelists typed fields; anything free-text never enters the object. */
  #facts(emails) {
    if (emails.length > MAX_EMAILS) throw new PlanError('Too many emails in context');
    return emails.map((email) => {
      try {
        return EmailFacts.from(email);
      } catch (error) {
        throw new PlanError('Stored email facts failed validation', { cause: error });
      }
    });
  }

  #userMessage(request, facts, now, timeZone) {
    return [
      `Now: ${now.toISOString()} (user's time zone: ${timeZone})`,
      `User request:\n${request}`,
      facts.length === 0
        ? 'Emails in context: none.'
        : `Emails in context (typed facts; text only via handles):\n${JSON.stringify(facts, null, 2)}`,
    ].join('\n\n');
  }

  /** Unknown tools, unknown or duplicate args and missing required args reject the whole plan. */
  #checkAgainstCatalogue(output) {
    const steps = output.steps.map((step, index) => {
      const tool = this.#tools.get(step.tool);
      if (!tool)
        throw new PlanError(`Step ${index} uses a tool that is not available: ${step.tool}`);
      const known = new Map(tool.args.map((arg) => [arg.name, arg]));
      const args = {};
      for (const { name, value } of step.args) {
        if (!known.has(name)) {
          throw new PlanError(`Step ${index} (${step.tool}) has an unknown argument: ${name}`);
        }
        args[name] = value;
      }
      for (const arg of tool.args) {
        if (arg.required && !(arg.name in args)) {
          throw new PlanError(`Step ${index} (${step.tool}) is missing argument: ${arg.name}`);
        }
      }
      return Object.freeze({ tool: step.tool, args: Object.freeze(args) });
    });
    return Object.freeze({ message: output.message, steps: Object.freeze(steps) });
  }

  #renderCatalogue(tools) {
    return tools
      .map((tool) => {
        const args =
          tool.args.length === 0
            ? '(no arguments)'
            : tool.args
                .map(
                  (arg) =>
                    `- \`${arg.name}\` (${arg.type}${arg.required ? ', required' : ''}): ${arg.description}`,
                )
                .join('\n');
        return `## ${tool.name}\n${tool.description}\n${args}`;
      })
      .join('\n\n');
  }
}

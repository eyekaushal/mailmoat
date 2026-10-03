import { TaggedValue } from '../agent/TaggedValue.js';
import { ToolError } from '../core/errors.js';

/**
 * Performs a tool call the Policy Engine allowed, or the user approved (PRD F12.5). It is the
 * only code that calls `Tool.execute`, so every action is validated once more, tagged with the
 * provenance of its inputs and written to the audit log in one place.
 */
export class ActionExecutor {
  #registry;
  #auditLog;

  /**
   * @param {{
   *   registry: import('../agent/tools/ToolRegistry.js').ToolRegistry,
   *   auditLog: Pick<import('../audit/AuditLog.js').AuditLog, 'record'>,
   * }} deps
   */
  constructor({ registry, auditLog }) {
    this.#registry = registry;
    this.#auditLog = auditLog;
  }

  /**
   * @param {import('../agent/PlanInterpreter.js').ToolCall} call
   * @param {import('../agent/tools/Tool.js').ToolContext} context
   * @param {{ approvalId?: string | null }} [origin]
   * @returns {Promise<TaggedValue>} the result, carrying the provenance of every argument
   * @throws {ToolError} and whatever the tool throws; callers fail closed
   */
  async perform(call, context, { approvalId = null } = {}) {
    const tool = this.#registry.get(call.tool);
    tool.parseArgs(Object.fromEntries(Object.entries(call.args).map(([k, v]) => [k, v.value])));
    const result = await tool.execute(call.args, context);
    if (!(result instanceof TaggedValue)) {
      throw new ToolError(`${tool.name} returned an untagged value`);
    }
    // Invariant 3: a result inherits the provenance of everything that went into the call.
    const tagged = TaggedValue.combine(result.value, [result, ...Object.values(call.args)]);
    this.#auditLog.record({
      actor: approvalId ? 'user' : 'system',
      event: 'action_performed',
      subject: tool.name,
      data: {
        step: call.step,
        approvalId,
        emailIds: call.emailIds,
        sources: tagged.sources,
      },
    });
    return tagged;
  }
}

import { isHandleReference, isStepReference } from '@mailmoat/shared/schemas/plan';
import { ToolError } from '../core/errors.js';
import { TaggedValue } from './TaggedValue.js';

/**
 * @typedef {{ outcome: 'ALLOW'|'ASK'|'DENY', reason: string }} Decision
 * @typedef {{
 *   step: number,
 *   tool: string,
 *   args: import('./tools/Tool.js').TaggedArgs,
 *   emailIds: string[],
 * }} ToolCall what the Policy Engine judges and an approval stores
 * @typedef {{
 *   request: string,
 *   handles: import('./HandleStore.js').HandleStore,
 *   now: Date,
 *   timeZone: string,
 * }} Session
 * @typedef {{
 *   step: number, tool: string, decision: Decision['outcome'], reason: string,
 *   result: TaggedValue | null, approvalId: string | null,
 * }} StepOutcome
 * @typedef {{ status: 'completed'|'pending'|'stopped', message: string, steps: StepOutcome[] }} RunResult
 */

/**
 * Runs a validated plan step by step (SECURITY_APPROACH §7.6, PRD F12.3, F12.7).
 *
 * Every argument becomes a `TaggedValue` before anything else happens: literals are `user`
 * data only when they appear verbatim in the user's request (otherwise `planner`), handles
 * resolve to tainted email text, and step references carry the earlier result's tags. The
 * Policy Engine sees every call; a DENY, a thrown error or a failed validation stops the plan,
 * and an ASK hands the call to approvals and stops too, since later steps would build on an
 * action that has not happened.
 */
export class PlanInterpreter {
  #registry;
  #policy;
  #approvals;
  #auditLog;
  #logger;

  /**
   * @param {{
   *   registry: import('./tools/ToolRegistry.js').ToolRegistry,
   *   policy: { decide(call: ToolCall): Decision | Promise<Decision> },
   *   approvals: { request(input: { call: ToolCall, reason: string }): Promise<{ id: string }> },
   *   auditLog: Pick<import('../audit/AuditLog.js').AuditLog, 'record'>,
   *   logger: import('../core/Logger.js').Logger,
   * }} deps
   */
  constructor({ registry, policy, approvals, auditLog, logger }) {
    this.#registry = registry;
    this.#policy = policy;
    this.#approvals = approvals;
    this.#auditLog = auditLog;
    this.#logger = logger;
  }

  /**
   * @param {import('./Planner.js').Plan} plan
   * @param {Session} session
   * @returns {Promise<RunResult>}
   */
  async run(plan, session) {
    /** @type {TaggedValue[]} */
    const results = [];
    /** @type {StepOutcome[]} */
    const steps = [];
    for (const [index, step] of plan.steps.entries()) {
      let outcome;
      try {
        outcome = await this.#runStep(index, step, results, session);
      } catch (error) {
        // Fail closed (F12.7): whatever went wrong, this step is denied and nothing after it runs.
        this.#logger.warn('Plan step failed; plan stopped', { step: index, error: error.name });
        outcome = this.#outcome(index, step.tool, 'DENY', `${error.name}: ${error.message}`);
        this.#audit(outcome, {});
      }
      steps.push(outcome);
      if (outcome.decision === 'DENY') return { status: 'stopped', message: plan.message, steps };
      if (outcome.decision === 'ASK') return { status: 'pending', message: plan.message, steps };
      results[index] = outcome.result;
    }
    return { status: 'completed', message: plan.message, steps };
  }

  async #runStep(index, step, results, session) {
    const tool = this.#registry.get(step.tool);
    const tagged = await this.#resolveArgs(step.args, results, session);
    const args = this.#validate(tool, tagged);
    const call = { step: index, tool: tool.name, args, emailIds: this.#emailIds(args) };
    const decision = await this.#policy.decide(call);
    const outcome = this.#outcome(index, tool.name, decision.outcome, decision.reason);
    if (decision.outcome === 'ASK') {
      const { id } = await this.#approvals.request({ call, reason: decision.reason });
      outcome.approvalId = id;
    } else if (decision.outcome === 'ALLOW') {
      const result = await tool.execute(args, { now: session.now, timeZone: session.timeZone });
      if (!(result instanceof TaggedValue)) {
        throw new ToolError(`${tool.name} returned an untagged value`);
      }
      // Invariant 3: a result inherits the provenance of everything that went into the call.
      outcome.result = TaggedValue.combine(result.value, [result, ...Object.values(args)]);
    } else if (decision.outcome !== 'DENY') {
      throw new ToolError(`Policy returned an unknown outcome: ${decision.outcome}`);
    }
    this.#audit(outcome, args);
    return outcome;
  }

  async #resolveArgs(args, results, session) {
    const tagged = {};
    for (const [name, value] of Object.entries(args)) {
      if (isHandleReference(value)) {
        tagged[name] = await session.handles.resolve(value.handle);
      } else if (isStepReference(value)) {
        tagged[name] = this.#fromStep(value, results);
      } else {
        tagged[name] = this.#fromLiteral(value, session.request);
      }
    }
    return tagged;
  }

  #fromStep({ step, field }, results) {
    const prior = results[step];
    if (!prior) throw new ToolError(`Step ${step} has no result to reference`);
    if (field === null) return prior;
    let current = prior.value;
    for (const key of field.split('.')) {
      if (current === null || typeof current !== 'object' || !(key in current)) {
        throw new ToolError(`Step ${step} result has no field "${field}"`);
      }
      current = current[key];
    }
    return prior.derive(current);
  }

  /**
   * The Planner relays what the user typed, but it can also make text up. Only text found in
   * the request counts as the user's; everything else is the Planner's own and the Policy
   * Engine treats it with suspicion (e.g. as a recipient).
   */
  #fromLiteral(value, request) {
    if (Array.isArray(value)) {
      if (value.length === 0) return PlanInterpreter.#fromPlanner(value);
      return TaggedValue.combine(
        value,
        value.map((item) => this.#fromLiteral(item, request)),
      );
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const typed = request.toLowerCase().includes(value.trim().toLowerCase());
      return typed ? TaggedValue.fromUser(value) : PlanInterpreter.#fromPlanner(value);
    }
    return PlanInterpreter.#fromPlanner(value);
  }

  static #fromPlanner(value) {
    return new TaggedValue(value, [{ type: 'planner' }], 'public');
  }

  /** Validates the raw values and re-tags the (possibly normalised) parsed values. */
  #validate(tool, tagged) {
    const raw = Object.fromEntries(Object.entries(tagged).map(([k, v]) => [k, v.value]));
    const parsed = tool.parseArgs(raw);
    return Object.fromEntries(
      Object.entries(parsed).map(([name, value]) => [name, tagged[name].derive(value)]),
    );
  }

  /** Emails this call touches: by id argument or by the provenance of any argument. */
  #emailIds(args) {
    const ids = new Set();
    if (typeof args.email_id?.value === 'string') ids.add(args.email_id.value);
    for (const value of Object.values(args)) value.emailIds().forEach((id) => ids.add(id));
    return [...ids];
  }

  #outcome(step, tool, decision, reason) {
    return { step, tool, decision, reason, result: null, approvalId: null };
  }

  /** Decision, reason and provenance only: argument values may contain email text. */
  #audit(outcome, args) {
    this.#auditLog.record({
      actor: 'system',
      event: 'policy_decision',
      subject: outcome.tool,
      decision: outcome.decision,
      reason: outcome.reason,
      data: {
        step: outcome.step,
        approvalId: outcome.approvalId,
        args: Object.fromEntries(
          Object.entries(args).map(([name, value]) => {
            const { sources, readers } = value.toJSON();
            return [name, { sources, readers }];
          }),
        ),
      },
    });
  }
}

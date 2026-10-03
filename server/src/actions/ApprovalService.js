import { randomUUID } from 'node:crypto';
import { TaggedValue } from '../agent/TaggedValue.js';
import { ApprovalError } from '../core/errors.js';

/**
 * Queues ASK decisions for the user and carries them out once approved (PRD F12.5, F8.3).
 * An approval stores the exact call: tool, every argument with its provenance, the emails
 * involved and the policy reason. The user may edit arguments (edited values are their own
 * words), then approve or reject. On approval the Policy Engine runs again on the stored call,
 * so a call that would now be denied is refused even though the user said yes.
 */
export class ApprovalService {
  #approvals;
  #registry;
  #policy;
  #executor;
  #auditLog;
  #now;

  /**
   * @param {{
   *   approvals: import('../db/repositories/ApprovalRepository.js').ApprovalRepository,
   *   registry: import('../agent/tools/ToolRegistry.js').ToolRegistry,
   *   policy: Pick<import('../policy/PolicyEngine.js').PolicyEngine, 'decide'>,
   *   executor: Pick<import('./ActionExecutor.js').ActionExecutor, 'perform'>,
   *   auditLog: Pick<import('../audit/AuditLog.js').AuditLog, 'record'>,
   *   now?: () => Date,
   * }} deps
   */
  constructor({ approvals, registry, policy, executor, auditLog, now = () => new Date() }) {
    this.#approvals = approvals;
    this.#registry = registry;
    this.#policy = policy;
    this.#executor = executor;
    this.#auditLog = auditLog;
    this.#now = now;
  }

  /**
   * @param {{ call: import('../agent/PlanInterpreter.js').ToolCall, reason: string }} input
   * @returns {Promise<{ id: string }>}
   */
  async request({ call, reason }) {
    const id = randomUUID();
    const payload = {
      step: call.step,
      tool: call.tool,
      emailIds: call.emailIds,
      reason,
      args: Object.fromEntries(Object.entries(call.args).map(([k, v]) => [k, v.toJSON()])),
    };
    const args = Object.values(call.args);
    const sources = args.length > 0 ? TaggedValue.combine(null, args).sources : [];
    this.#approvals.create({
      id,
      kind: call.tool,
      payload,
      sources,
      requestedAt: this.#now().toISOString(),
    });
    this.#auditLog.record({
      actor: 'system',
      event: 'approval_requested',
      subject: call.tool,
      reason,
      data: { approvalId: id, step: call.step, emailIds: call.emailIds, sources },
    });
    return { id };
  }

  /** What the Approvals page shows: the exact action, content, data sources and reason. */
  listPending() {
    return this.#approvals.listPending().map((row) => ({
      id: row.id,
      tool: row.kind,
      reason: row.payload.reason,
      emailIds: row.payload.emailIds,
      args: row.payload.args,
      requestedAt: row.requestedAt,
    }));
  }

  /**
   * Replaces argument values with the user's edits (user-sourced), after validating them.
   * @param {string} id
   * @param {Record<string, unknown>} changes argument name → new value
   */
  edit(id, changes) {
    const row = this.#pending(id);
    const tool = this.#registry.get(row.kind);
    const args = { ...row.payload.args };
    for (const [name, value] of Object.entries(changes)) {
      if (!(name in args)) throw new ApprovalError(`Unknown argument: ${name}`);
      args[name] = TaggedValue.fromUser(value).toJSON();
    }
    tool.parseArgs(Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v.value])));
    this.#approvals.updatePayload(id, { ...row.payload, args });
  }

  /**
   * @param {string} id
   * @param {{ via: string, timeZone: string }} options who/where approved, and the user's zone
   * @returns {Promise<{ status: 'performed', result: TaggedValue } | { status: 'denied', reason: string }>}
   */
  async approve(id, { via, timeZone }) {
    const row = this.#pending(id);
    const call = this.#call(row);
    const decision = this.#policy.decide(call);
    if (decision.outcome === 'DENY') {
      this.#close(row, 'REJECTED', via, decision.reason);
      return { status: 'denied', reason: decision.reason };
    }
    const result = await this.#executor.perform(
      call,
      { now: this.#now(), timeZone },
      { approvalId: id },
    );
    this.#close(row, 'APPROVED', via, decision.reason);
    return { status: 'performed', result };
  }

  /** @param {string} id @param {{ via: string }} options */
  reject(id, { via }) {
    const row = this.#pending(id);
    this.#close(row, 'REJECTED', via, 'Rejected by the user');
  }

  #pending(id) {
    const row = this.#approvals.get(id);
    if (!row) throw new ApprovalError('Unknown approval');
    if (row.status !== 'PENDING') throw new ApprovalError(`Approval is ${row.status}`);
    return row;
  }

  #call(row) {
    const { step, tool, emailIds, args } = row.payload;
    return {
      step,
      tool,
      emailIds,
      args: Object.fromEntries(Object.entries(args).map(([k, v]) => [k, TaggedValue.fromJSON(v)])),
    };
  }

  #close(row, status, via, reason) {
    const decidedAt = this.#now().toISOString();
    if (!this.#approvals.decide(row.id, { status, decidedAt, via })) {
      throw new ApprovalError('Approval was decided concurrently');
    }
    this.#auditLog.record({
      actor: 'user',
      event: 'approval_decided',
      subject: row.kind,
      decision: status,
      reason,
      data: { approvalId: row.id, via },
    });
  }
}

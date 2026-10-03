import { EmailFacts } from '../agent/EmailFacts.js';
import { Decision } from './Decision.js';

/**
 * The only thing that decides ALLOW / ASK / DENY (invariant 4), by plain code. It looks up the
 * risk and participants of every email a call touches, hands the call to the one rule for that
 * tool, and fails closed: no rule, an unknown email, or a rule that throws all mean DENY.
 */
export class PolicyEngine {
  #rules;
  #emails;
  #verdicts;
  #logger;

  /**
   * @param {{
   *   rules: import('./rules/PolicyRule.js').PolicyRule[],
   *   emails: Pick<import('../db/repositories/EmailRepository.js').EmailRepository, 'get'>,
   *   verdicts: Pick<import('../db/repositories/VerdictRepository.js').VerdictRepository, 'get'>,
   *   logger: import('../core/Logger.js').Logger,
   * }} deps
   */
  constructor({ rules, emails, verdicts, logger }) {
    this.#rules = rules;
    this.#emails = emails;
    this.#verdicts = verdicts;
    this.#logger = logger;
  }

  /**
   * @param {import('../agent/PlanInterpreter.js').ToolCall} call
   * @returns {Decision}
   */
  decide(call) {
    try {
      const rule = this.#rules.find((r) => r.applies(call.tool));
      if (!rule) return Decision.deny(`No policy rule covers ${call.tool}`, 'PolicyEngine');
      return rule.decide(call, this.#context(call));
    } catch (error) {
      this.#logger.warn('Policy check failed; denying', { tool: call.tool, error: error.name });
      return Decision.deny(`Policy check failed (${error.name})`, 'PolicyEngine');
    }
  }

  /** An email without a verdict has not been through the pipeline: treated as SUSPICIOUS. */
  #context(call) {
    const levels = {};
    const participants = {};
    for (const id of call.emailIds) {
      levels[id] = this.#verdicts.get(id)?.level ?? 'SUSPICIOUS';
      const record = this.#emails.get(id);
      participants[id] = record ? EmailFacts.participants(record) : [];
    }
    return { levels, participants };
  }
}

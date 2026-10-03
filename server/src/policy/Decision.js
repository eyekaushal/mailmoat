/** @typedef {'ALLOW'|'ASK'|'DENY'} Outcome */

/** What the Policy Engine said about one tool call, and why. Immutable. */
export class Decision {
  /**
   * @param {Outcome} outcome
   * @param {string} reason shown to the user and written to the audit log
   * @param {string} rule the rule class that decided
   */
  constructor(outcome, reason, rule) {
    this.outcome = outcome;
    this.reason = reason;
    this.rule = rule;
    Object.freeze(this);
  }

  static allow(reason, rule) {
    return new Decision('ALLOW', reason, rule);
  }

  static ask(reason, rule) {
    return new Decision('ASK', reason, rule);
  }

  static deny(reason, rule) {
    return new Decision('DENY', reason, rule);
  }
}

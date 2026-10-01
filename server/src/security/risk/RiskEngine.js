import { maxRiskLevel, riskRank } from '@mailmoat/shared/constants/risk-levels';
import { Verdict } from './Verdict.js';

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

/**
 * Layer 4: turns signals and the Reader's form into a verdict, in plain code.
 *
 * level = max(floor, combinations, score band). Every input can only push the level up, so a
 * lying or failed Reader can never take an email below what the deterministic signals established.
 */
export class RiskEngine {
  #rules;

  /** @param {import('./RiskRules.js').RiskRules} rules */
  constructor(rules) {
    this.#rules = rules;
  }

  /**
   * @param {import('../signals/Signal.js').SignalResult[]} signals
   * @param {import('../reader/Reader.js').ReaderResult} reader
   * @returns {Verdict}
   */
  evaluate(signals, reader) {
    const fired = new Set(signals.map((signal) => signal.id));
    const input = { has: (id) => fired.has(id), form: reader.form, readerFailed: reader.failed };

    const floors = this.#rules.floorRules.filter((rule) => rule.when(input));
    const combinations = this.#rules.combinationRules.filter((rule) => rule.when(input));
    const score = Math.min(
      100,
      signals.reduce((sum, signal) => sum + this.#rules.weightFor(signal.severity), 0),
    );

    const floor = maxRiskLevel('SAFE', ...floors.map((rule) => rule.level));
    const level = maxRiskLevel(
      floor,
      ...combinations.map((rule) => rule.level),
      this.#rules.bandFor(score),
    );
    const matched = [...floors, ...combinations].sort(
      (a, b) => riskRank(b.level) - riskRank(a.level),
    );
    const signalReasons = [...signals]
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
      .map((signal) => signal.reason);

    return new Verdict({
      level,
      score,
      // Rule reasons first: they say why the level is what it is; signal reasons give the evidence.
      reasons: [...new Set([...matched.map((rule) => rule.reason), ...signalReasons])],
      floor,
      floorReasons: floors.map((rule) => rule.reason),
      injectionAttempt: matched.some((rule) => rule.injection),
      verifyByPhone: matched.some((rule) => rule.verifyByPhone),
    });
  }
}

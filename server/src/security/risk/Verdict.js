/** @typedef {'SAFE'|'SUSPICIOUS'|'DANGEROUS'} RiskLevel */

const TOP_REASONS = 3;

/** The Risk Engine's decision for one email. Immutable. */
export class Verdict {
  /**
   * @param {object} fields
   * @param {RiskLevel} fields.level final level: never below `floor`
   * @param {number} fields.score 0–100, for ranking and the UI meter only
   * @param {string[]} fields.reasons every contributing reason, most important first
   * @param {RiskLevel} fields.floor level guaranteed by deterministic rules
   * @param {string[]} fields.floorReasons
   * @param {boolean} fields.injectionAttempt label "Injection attempt" and log it
   * @param {boolean} fields.verifyByPhone show the "verify by phone" banner
   */
  constructor({ level, score, reasons, floor, floorReasons, injectionAttempt, verifyByPhone }) {
    this.level = level;
    this.score = score;
    this.reasons = Object.freeze([...reasons]);
    this.floor = floor;
    this.floorReasons = Object.freeze([...floorReasons]);
    this.injectionAttempt = injectionAttempt;
    this.verifyByPhone = verifyByPhone;
    Object.freeze(this);
  }

  /** @returns {string[]} what the UI shows first */
  topReasons() {
    return this.reasons.slice(0, TOP_REASONS);
  }
}

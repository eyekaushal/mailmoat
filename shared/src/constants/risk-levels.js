/**
 * Risk levels in ascending order of severity.
 * The order matters: the Risk Engine may only move a verdict up this list
 * from its deterministic floor, never down (SECURITY_APPROACH.md, principle P4).
 */
export const RISK_LEVELS = Object.freeze(['SAFE', 'SUSPICIOUS', 'DANGEROUS']);

/**
 * @param {string} level
 * @returns {number} position in RISK_LEVELS
 */
export function riskRank(level) {
  const rank = RISK_LEVELS.indexOf(level);
  if (rank === -1) throw new RangeError(`Unknown risk level: ${level}`);
  return rank;
}

/**
 * Returns the more severe of the given levels.
 * @param {...string} levels
 * @returns {string}
 */
export function maxRiskLevel(...levels) {
  if (levels.length === 0) throw new RangeError('maxRiskLevel needs at least one level');
  return levels.reduce((worst, level) => (riskRank(level) > riskRank(worst) ? level : worst));
}

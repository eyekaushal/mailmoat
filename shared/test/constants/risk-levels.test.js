import { describe, expect, it } from 'vitest';
import { RISK_LEVELS, maxRiskLevel, riskRank } from '../../src/constants/risk-levels.js';

describe('risk levels', () => {
  it('orders levels from least to most severe', () => {
    expect(RISK_LEVELS).toEqual(['SAFE', 'SUSPICIOUS', 'DANGEROUS']);
    expect(riskRank('SAFE')).toBeLessThan(riskRank('DANGEROUS'));
  });

  it('cannot be modified at runtime', () => {
    expect(Object.isFrozen(RISK_LEVELS)).toBe(true);
  });

  it('picks the most severe level', () => {
    expect(maxRiskLevel('SAFE', 'DANGEROUS', 'SUSPICIOUS')).toBe('DANGEROUS');
    expect(maxRiskLevel('SAFE')).toBe('SAFE');
  });

  it('rejects unknown levels instead of guessing', () => {
    expect(() => riskRank('LOW')).toThrow(RangeError);
    expect(() => maxRiskLevel()).toThrow(RangeError);
  });
});

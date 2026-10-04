import { describe, expect, it } from 'vitest';
import { RiskEngine } from '../../../../src/security/risk/RiskEngine.js';
import { RiskRules } from '../../../../src/security/risk/RiskRules.js';
import { VALID_FORM } from '../../../../../shared/test/schemas/fixtures.js';

const engine = new RiskEngine(new RiskRules());
const SEVERITY = { S1: 'high', S5: 'high', S13: 'high', S17: 'high', S20: 'high', S0: 'high' };
// Everything else is medium, except the low ones listed below.
const signal = (id) => ({
  id,
  name: id,
  severity: SEVERITY[id] ?? (['S9', 'S10', 'S18', 'S3', 'S15'].includes(id) ? 'low' : 'medium'),
  reason: `${id} reason`,
});
const ok = (change = {}) => ({
  failed: false,
  form: {
    ...VALID_FORM,
    ...change,
    intents: { ...VALID_FORM.intents, ...change.intents },
  },
});
const evaluate = (ids, reader = ok()) => engine.evaluate(ids.map(signal), reader);

describe('RiskEngine', () => {
  describe('floors (deterministic)', () => {
    it.each([
      [['S1', 'S6'], 'DANGEROUS'],
      [['S1', 'S7'], 'DANGEROUS'],
      [['S5'], 'DANGEROUS'],
      [['S13'], 'DANGEROUS'],
      [['S17'], 'DANGEROUS'],
      [['S20'], 'DANGEROUS'],
      [['S6'], 'SUSPICIOUS'],
      [['S7'], 'SUSPICIOUS'],
      [['S8'], 'SUSPICIOUS'],
      [['S14'], 'SUSPICIOUS'],
      [['S19'], 'SUSPICIOUS'],
      [['S1'], 'SUSPICIOUS'],
      [['S2'], 'SUSPICIOUS'],
      [['S12'], 'SUSPICIOUS'],
      [['S0'], 'SUSPICIOUS'],
    ])('%j → floor %s', (ids, level) => {
      const verdict = evaluate(ids);
      expect(verdict.floor).toBe(level);
      expect(verdict.level).toBe(level);
    });

    it('is SAFE with no signals and a harmless form', () => {
      expect(evaluate([])).toMatchObject({ level: 'SAFE', floor: 'SAFE', score: 0, reasons: [] });
    });

    it('fails closed to SUSPICIOUS when the Reader failed', () => {
      const verdict = evaluate([], { failed: true, form: null, reason: 'x' });
      expect(verdict).toMatchObject({ level: 'SUSPICIOUS', floor: 'SUSPICIOUS' });
      expect(verdict.reasons[0]).toBe('mailmoat could not fully check this email.');
    });

    it('cannot be lowered by a Reader that says everything is fine', () => {
      const harmless = ok({ category: 'newsletter', urgency: 'none', claims_to_be: 'none' });
      expect(evaluate(['S5'], harmless).level).toBe('DANGEROUS');
      expect(evaluate(['S13'], harmless).level).toBe('DANGEROUS');
    });
  });

  describe('combinations (Reader can raise)', () => {
    it('always flags a bank detail change, with the verify-by-phone banner', () => {
      const verdict = evaluate([], ok({ intents: { asks_bank_detail_change: true } }));
      expect(verdict).toMatchObject({ level: 'SUSPICIOUS', floor: 'SAFE', verifyByPhone: true });
    });

    it.each(['S4', 'S11'])('payment request + %s → DANGEROUS', (id) => {
      expect(evaluate([id], ok({ intents: { asks_for_payment: true } })).level).toBe('DANGEROUS');
      expect(evaluate([id], ok({ intents: { asks_bank_detail_change: true } })).level).toBe(
        'DANGEROUS',
      );
    });

    it.each(['S9', 'S10'])(
      'payment request + %s → DANGEROUS only with bank details, a claimed identity, pressure or a bank change (B28)',
      (id) => {
        const bill = ok({
          claims_to_be: 'none',
          urgency: 'none',
          intents: { asks_for_payment: true },
        });
        expect(evaluate([id], bill).level).toBe('SAFE');
        expect(evaluate([id, 'S21'], bill).level).toBe('DANGEROUS');
        expect(
          evaluate([id], ok({ claims_to_be: 'vendor', intents: { asks_for_payment: true } })).level,
        ).toBe('DANGEROUS');
        expect(
          evaluate(
            [id],
            ok({ claims_to_be: 'none', urgency: 'high', intents: { asks_for_payment: true } }),
          ).level,
        ).toBe('DANGEROUS');
        expect(
          evaluate(
            [id],
            ok({
              claims_to_be: 'none',
              intents: { asks_for_payment: true, asks_for_secrecy: true },
            }),
          ).level,
        ).toBe('DANGEROUS');
        expect(
          evaluate([id], ok({ claims_to_be: 'none', intents: { asks_bank_detail_change: true } }))
            .level,
        ).toBe('DANGEROUS');
      },
    );

    it('payment request from a known, authenticated sender stays SAFE', () => {
      expect(evaluate([], ok({ intents: { asks_for_payment: true } })).level).toBe('SAFE');
      expect(evaluate(['S21'], ok({ intents: { asks_for_payment: true } })).level).toBe('SAFE');
    });

    it.each(['S10', 'S14', 'S18'])('credentials request + %s → DANGEROUS', (id) => {
      expect(evaluate([id], ok({ intents: { asks_for_credentials: true } })).level).toBe(
        'DANGEROUS',
      );
    });

    it('a password reset from a new address at a known domain is routine (S9 alone)', () => {
      expect(evaluate(['S9'], ok({ intents: { asks_for_credentials: true } })).level).toBe('SAFE');
    });

    it.each(['executive', 'bank', 'it_support', 'government'])(
      'claims to be %s + first-time sender → SUSPICIOUS',
      (claim) => {
        expect(evaluate(['S9'], ok({ claims_to_be: claim })).level).toBe('SUSPICIOUS');
      },
    );

    it('a brand claim counts only when code finds a listed brand behind it (S6, S7 or S22)', () => {
      expect(evaluate(['S9', 'S10'], ok({ claims_to_be: 'brand' })).level).toBe('SAFE');
      for (const id of ['S6', 'S7', 'S22'])
        expect(evaluate([id], ok({ claims_to_be: 'brand' })).level).toBe('SUSPICIOUS');
    });

    it('a colleague claim from a first-time sender is not raised', () => {
      expect(evaluate(['S9'], ok({ claims_to_be: 'colleague' })).level).toBe('SAFE');
    });

    it('urgent + secret + money → DANGEROUS even from a known sender', () => {
      const form = ok({
        urgency: 'high',
        intents: { asks_for_secrecy: true, asks_for_payment: true },
      });
      expect(evaluate([], form).level).toBe('DANGEROUS');
      const notSecret = ok({ urgency: 'high', intents: { asks_for_payment: true } });
      expect(evaluate([], notSecret).level).toBe('SAFE');
    });

    it.each(['brand', 'bank', 'it_support', 'government'])(
      'callback phishing: call a number + claims %s + first-time sender → DANGEROUS',
      (claim) => {
        const form = ok({ claims_to_be: claim, intents: { asks_to_call_number: true } });
        expect(evaluate(['S9'], form).level).toBe('DANGEROUS');
        expect(evaluate(['S10'], form).level).toBe('DANGEROUS');
        expect(evaluate([], form).level).toBe('SAFE');
      },
    );

    it('a number to call from a vendor or a person is not callback phishing', () => {
      const form = ok({ claims_to_be: 'vendor', intents: { asks_to_call_number: true } });
      expect(evaluate(['S9', 'S10'], form).level).toBe('SAFE');
    });

    it('text addressing an AI → SUSPICIOUS and an injection attempt', () => {
      const verdict = evaluate([], ok({ intents: { asks_to_change_ai_behaviour: true } }));
      expect(verdict).toMatchObject({ level: 'SUSPICIOUS', injectionAttempt: true });
    });
  });

  describe('score', () => {
    it('sums severity weights and maps bands', () => {
      expect(evaluate(['S9', 'S10', 'S18']).score).toBe(24);
      expect(evaluate(['S9', 'S10', 'S18']).level).toBe('SAFE');
      expect(evaluate(['S4', 'S9', 'S10', 'S15']).level).toBe('SUSPICIOUS');
    });

    it('caps at 100', () => {
      expect(evaluate(['S1', 'S5', 'S13', 'S17', 'S20']).score).toBe(100);
    });
  });

  it('lists the most severe rule reasons first, then signal evidence', () => {
    const verdict = evaluate(['S9', 'S12', 'S13']);
    expect(verdict.reasons[0]).toMatch(/prompt-injection/);
    expect(verdict.reasons).toContain('S13 reason');
    expect(verdict.topReasons()).toHaveLength(3);
    expect(verdict.injectionAttempt).toBe(true);
    expect(Object.isFrozen(verdict)).toBe(true);
  });
});

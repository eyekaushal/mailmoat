import { describe, expect, it } from 'vitest';
import { ReaderFormSchema } from '../../src/schemas/reader-form.js';
import { VALID_FORM } from './fixtures.js';

const withChange = (change) => ({ ...VALID_FORM, ...change });

describe('ReaderFormSchema', () => {
  it('accepts a complete form', () => {
    expect(ReaderFormSchema.parse(VALID_FORM)).toEqual(VALID_FORM);
    expect(ReaderFormSchema.safeParse(withChange({ meeting_request: null })).success).toBe(true);
  });

  it.each([
    ['an unknown top-level key', { send_to: 'x@evil.example' }],
    ['an unknown intent', { intents: { ...VALID_FORM.intents, asks_to_forward: true } }],
    ['a missing intent', { intents: { asks_for_payment: false } }],
    ['an unknown category', { category: 'urgent_action' }],
    ['an unknown claim', { claims_to_be: 'ceo' }],
    ['a string boolean', { needs_reply: 'yes' }],
    ['a long summary', { summary: 'x'.repeat(301) }],
    ['a long brand', { claimed_brand: 'x'.repeat(41) }],
    ['a non-ISO time', { meeting_request: { proposed_times: ['Friday at 5'] } }],
    ['too many times', { meeting_request: { proposed_times: Array(6).fill('2026-10-09T17:00') } }],
  ])('rejects %s', (_label, change) => {
    expect(ReaderFormSchema.safeParse(withChange(change)).success).toBe(false);
  });

  it('rejects a missing field', () => {
    const withoutSummary = structuredClone(VALID_FORM);
    delete withoutSummary.summary;
    expect(ReaderFormSchema.safeParse(withoutSummary).success).toBe(false);
  });
});

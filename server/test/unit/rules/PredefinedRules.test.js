import { describe, expect, it } from 'vitest';
import { SECURITY_LABELS } from '@mailmoat/shared/constants/labels';
import { RULE_ACTIONS } from '@mailmoat/shared/constants/rules';
import { PredefinedRules } from '../../../src/rules/PredefinedRules.js';
import { VALID_FORM } from '../../../../shared/test/schemas/fixtures.js';

const rules = new PredefinedRules();

/** Typed facts for a SAFE inbound email the other party sent last. */
function facts(overrides = {}, form = {}) {
  return {
    direction: 'inbound',
    level: 'SAFE',
    injectionAttempt: false,
    firstTimeSender: false,
    lastInThreadFromUser: false,
    ...overrides,
    form: form === null ? null : { ...VALID_FORM, meeting_request: null, ...form },
  };
}

const matches = (id, f) => rules.get(id).matches(f);

describe('PredefinedRules', () => {
  it('defines the 12 rules of PRD F4 with valid actions, security rules first', () => {
    const all = rules.list();
    expect(all.map((r) => r.id)).toEqual([
      'suspicious',
      'dangerous',
      'injection_attempt',
      'to_reply',
      'awaiting_reply',
      'fyi',
      'newsletter',
      'marketing',
      'calendar',
      'receipt',
      'notification',
      'cold_email',
    ]);
    for (const rule of all) {
      expect(rule.defaultActions.every((a) => RULE_ACTIONS.includes(a))).toBe(true);
      expect(rule.defaultActions.every((a) => rule.allowedActions.includes(a))).toBe(true);
      expect(Object.isFrozen(rule)).toBe(true);
      if (rule.isSecurity) expect(rule.allowedActions).toEqual(rule.defaultActions);
      else expect(rule.label.toLowerCase().startsWith('mailmoat/')).toBe(false);
    }
    expect(all.filter((r) => r.isSecurity).map((r) => r.label)).toEqual([
      SECURITY_LABELS.SUSPICIOUS,
      SECURITY_LABELS.DANGEROUS,
      SECURITY_LABELS.INJECTION,
    ]);
    // Only To Reply may draft (F4.2).
    expect(all.filter((r) => r.allowedActions.includes('draft_reply')).map((r) => r.id)).toEqual([
      'to_reply',
    ]);
    expect(rules.get('nope')).toBeUndefined();
  });

  it('matches the security rules from the verdict only', () => {
    expect(matches('suspicious', facts({ level: 'SUSPICIOUS' }))).toBe(true);
    expect(matches('suspicious', facts({ level: 'DANGEROUS' }))).toBe(false);
    expect(matches('dangerous', facts({ level: 'DANGEROUS' }))).toBe(true);
    expect(matches('dangerous', facts({ level: 'SAFE' }))).toBe(false);
    expect(matches('injection_attempt', facts({ injectionAttempt: true }))).toBe(true);
    expect(matches('injection_attempt', facts())).toBe(false);
    // A Reader failure leaves no form; security rules still work.
    expect(matches('dangerous', facts({ level: 'DANGEROUS' }, null))).toBe(true);
    expect(matches('to_reply', facts({}, null))).toBe(false);
  });

  it('To Reply: needs a reply and the other party spoke last', () => {
    expect(matches('to_reply', facts({}, { needs_reply: true }))).toBe(true);
    expect(matches('to_reply', facts({ lastInThreadFromUser: true }, { needs_reply: true }))).toBe(
      false,
    );
    expect(matches('to_reply', facts({}, { needs_reply: false }))).toBe(false);
  });

  it('Awaiting Reply: the user wrote last and expects an answer', () => {
    const sent = { direction: 'outbound', level: null, lastInThreadFromUser: true };
    expect(rules.get('awaiting_reply').appliesTo).toBe('outbound');
    expect(matches('awaiting_reply', facts(sent, { expects_reply: true }))).toBe(true);
    expect(matches('awaiting_reply', facts(sent, { expects_reply: false }))).toBe(false);
    expect(
      matches(
        'awaiting_reply',
        facts({ ...sent, lastInThreadFromUser: false }, { expects_reply: true }),
      ),
    ).toBe(false);
  });

  it('FYI: work or personal without a needed reply', () => {
    expect(matches('fyi', facts({}, { category: 'work', needs_reply: false }))).toBe(true);
    expect(matches('fyi', facts({}, { category: 'personal', needs_reply: false }))).toBe(true);
    expect(matches('fyi', facts({}, { category: 'work', needs_reply: true }))).toBe(false);
    expect(matches('fyi', facts({}, { category: 'newsletter', needs_reply: false }))).toBe(false);
  });

  it.each([
    ['newsletter', 'newsletter'],
    ['marketing', 'marketing'],
    ['receipt', 'receipt'],
    ['notification', 'notification'],
    ['notification', 'security_alert'],
    ['calendar', 'calendar'],
  ])('%s matches category %s and not "other"', (id, category) => {
    expect(matches(id, facts({}, { category }))).toBe(true);
    expect(matches(id, facts({}, { category: 'other' }))).toBe(false);
  });

  it('Calendar also matches any meeting request', () => {
    expect(
      matches('calendar', facts({}, { category: 'work', meeting_request: { proposed_times: [] } })),
    ).toBe(true);
  });

  it('Cold Email needs cold outreach from a first-time sender', () => {
    expect(
      matches('cold_email', facts({ firstTimeSender: true }, { category: 'cold_outreach' })),
    ).toBe(true);
    expect(matches('cold_email', facts({}, { category: 'cold_outreach' }))).toBe(false);
    expect(matches('cold_email', facts({ firstTimeSender: true }, { category: 'work' }))).toBe(
      false,
    );
  });
});

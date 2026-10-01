import { describe, expect, it } from 'vitest';
import { SpfDkimFailSignal } from '../../../../../src/security/signals/sender/SpfDkimFailSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new SpfDkimFailSignal();
const withAuth = (spf, dkim, trusted = true) =>
  ingestedEmail({
    auth: {
      trusted,
      spf: { result: spf, mailFrom: null },
      dkim: dkim.map((result) => ({ result, domain: 'acme-corp.com' })),
      dmarc: { result: 'none', headerFrom: null },
    },
  });

describe('SpfDkimFailSignal (S2)', () => {
  it.each([
    ['fail', ['fail']],
    ['softfail', []],
    ['none', ['neutral', 'fail']],
  ])('fires for spf=%s dkim=%j', (spf, dkim) => {
    expect(signal.evaluate(withAuth(spf, dkim), signalContext())).toMatchObject({
      id: 'S2',
      severity: 'medium',
    });
  });

  it('fails closed when there is no trusted Google stamp', () => {
    expect(signal.evaluate(withAuth('pass', ['pass'], false), signalContext())?.reason).toMatch(
      /no sender authentication results/,
    );
  });

  it.each([
    ['pass', []],
    ['fail', ['pass']],
    ['pass', ['pass']],
  ])('does not fire for spf=%s dkim=%j', (spf, dkim) => {
    expect(signal.evaluate(withAuth(spf, dkim), signalContext())).toBeNull();
  });
});

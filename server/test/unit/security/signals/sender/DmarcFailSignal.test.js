import { describe, expect, it } from 'vitest';
import { DmarcFailSignal } from '../../../../../src/security/signals/sender/DmarcFailSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new DmarcFailSignal();
const auth = (dmarc, trusted = true) => ({
  trusted,
  spf: { result: 'pass', mailFrom: null },
  dkim: [],
  dmarc: { result: dmarc, headerFrom: 'netflix.com' },
});

describe('DmarcFailSignal (S1)', () => {
  it('fires when Google reports dmarc=fail', () => {
    const email = ingestedEmail({
      from: { address: 'billing@netflix.com', name: 'Netflix' },
      auth: auth('fail'),
    });
    expect(signal.evaluate(email, signalContext())).toEqual({
      id: 'S1',
      name: 'AUTH_DMARC_FAIL',
      severity: 'high',
      reason:
        'Gmail could not verify that this email really comes from netflix.com (DMARC failed).',
    });
  });

  it.each(['pass', 'none', 'bestguesspass'])('does not fire for dmarc=%s', (result) => {
    expect(signal.evaluate(ingestedEmail({ auth: auth(result) }), signalContext())).toBeNull();
  });

  it('ignores results that are not from a trusted Google stamp', () => {
    expect(
      signal.evaluate(ingestedEmail({ auth: auth('fail', false) }), signalContext()),
    ).toBeNull();
  });
});

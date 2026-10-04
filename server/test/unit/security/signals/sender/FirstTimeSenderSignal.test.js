import { describe, expect, it } from 'vitest';
import { BrandList } from '../../../../../src/security/signals/BrandList.js';
import { Confusables } from '../../../../../src/security/signals/Confusables.js';
import { FirstTimeSenderSignal } from '../../../../../src/security/signals/sender/FirstTimeSenderSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new FirstTimeSenderSignal(new BrandList(new Confusables()));
const email = ingestedEmail();

describe('FirstTimeSenderSignal (S9)', () => {
  it('fires for an address never seen', () => {
    expect(signal.evaluate(email, signalContext())).toMatchObject({
      id: 'S9',
      severity: 'low',
      reason: 'You have never written to rahul@acme-corp.com.',
    });
  });

  it('fires when the address only ever sent to the user (attacker-controllable)', () => {
    const context = signalContext({ 'rahul@acme-corp.com': { receivedCount: 3 } });
    expect(signal.evaluate(email, context)).not.toBeNull();
  });

  it('does not fire for someone the user has written to', () => {
    const context = signalContext({ 'rahul@acme-corp.com': { sentCount: 1 } });
    expect(signal.evaluate(email, context)).toBeNull();
  });

  it('does not fire for a sender the user marked trusted', () => {
    const context = signalContext({ 'rahul@acme-corp.com': { trusted: true } });
    expect(signal.evaluate(email, context)).toBeNull();
  });

  it("does not fire for a listed brand's own DMARC-aligned domain, but does when DMARC fails", () => {
    const github = (dmarc) =>
      ingestedEmail({
        from: { address: 'noreply@github.com', name: 'GitHub' },
        auth: { ...ingestedEmail().auth, dmarc: { result: dmarc, headerFrom: 'github.com' } },
      });
    expect(signal.evaluate(github('pass'), signalContext())).toBeNull();
    expect(signal.evaluate(github('fail'), signalContext())).not.toBeNull();
    const untrusted = ingestedEmail({
      from: { address: 'noreply@github.com', name: 'GitHub' },
      auth: { ...ingestedEmail().auth, trusted: false },
    });
    expect(signal.evaluate(untrusted, signalContext())).not.toBeNull();
  });
});

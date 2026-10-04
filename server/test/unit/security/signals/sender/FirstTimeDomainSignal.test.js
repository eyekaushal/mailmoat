import { describe, expect, it } from 'vitest';
import { BrandList } from '../../../../../src/security/signals/BrandList.js';
import { Confusables } from '../../../../../src/security/signals/Confusables.js';
import { FirstTimeDomainSignal } from '../../../../../src/security/signals/sender/FirstTimeDomainSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new FirstTimeDomainSignal(new BrandList(new Confusables()));
const from = (address) => ingestedEmail({ from: { address, name: null } });

describe('FirstTimeDomainSignal (S10)', () => {
  it('fires when the user never wrote to anyone at the domain', () => {
    const context = signalContext({ 'someone@acme-corp.com': { receivedCount: 4 } });
    expect(signal.evaluate(from('rahul@acme-corp.com'), context)).toMatchObject({
      id: 'S10',
      reason: 'You have never written to anyone at acme-corp.com.',
    });
  });

  it('does not fire when the user wrote to a colleague at the domain', () => {
    const context = signalContext({ 'priya@acme-corp.com': { sentCount: 1 } });
    expect(signal.evaluate(from('rahul@acme-corp.com'), context)).toBeNull();
  });

  it('treats each free-mail address as its own domain', () => {
    const context = signalContext({ 'friend@gmail.com': { sentCount: 9 } });
    expect(signal.evaluate(from('rahul.ceo.office@gmail.com'), context)).not.toBeNull();
    expect(signal.evaluate(from('friend@gmail.com'), context)).toBeNull();
  });

  it('does not fire for a trusted sender', () => {
    const context = signalContext({ 'rahul@acme-corp.com': { trusted: true } });
    expect(signal.evaluate(from('rahul@acme-corp.com'), context)).toBeNull();
  });

  it("treats a listed brand's DMARC-aligned domain as known, and a look-alike as not", () => {
    expect(signal.evaluate(from('alerts@hdfcbank.net'), signalContext())).toBeNull();
    expect(
      signal.evaluate(from('alerts@hdfc-secure-alerts.example'), signalContext()),
    ).not.toBeNull();
  });
});

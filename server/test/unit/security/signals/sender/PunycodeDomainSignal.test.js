import { describe, expect, it } from 'vitest';
import { PunycodeDomainSignal } from '../../../../../src/security/signals/sender/PunycodeDomainSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new PunycodeDomainSignal();
const link = (host) => ({ href: `https://${host}/`, text: 'x', source: 'html', host });

describe('PunycodeDomainSignal (S8)', () => {
  it('fires for an xn-- sender domain and shows how it looks', () => {
    const email = ingestedEmail({ from: { address: 'x@xn--pypal-4ve.com', name: null } });
    expect(signal.evaluate(email, signalContext())).toMatchObject({
      id: 'S8',
      severity: 'medium',
      reason: expect.stringContaining('sender domain pаypal.com (xn--pypal-4ve.com)'),
    });
  });

  it('fires for a Unicode sender domain', () => {
    const email = ingestedEmail({ from: { address: 'x@pаypal.com', name: null } });
    expect(signal.evaluate(email, signalContext())).not.toBeNull();
  });

  it('fires for Reply-To and link domains', () => {
    const replyTo = ingestedEmail({ replyTo: [{ address: 'a@xn--80ak6aa92e.com', name: null }] });
    expect(signal.evaluate(replyTo, signalContext())?.reason).toMatch(/^The Reply-To domain/);
    const links = ingestedEmail({ links: [link('ok.example'), link('login.xn--80ak6aa92e.com')] });
    expect(signal.evaluate(links, signalContext())?.reason).toMatch(/^The link domain/);
  });

  it('does not fire for plain ASCII domains or host-less links', () => {
    const email = ingestedEmail({ links: [link('netflix.com'), { ...link('x'), host: null }] });
    expect(signal.evaluate(email, signalContext())).toBeNull();
  });
});

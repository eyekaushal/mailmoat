import { describe, expect, it } from 'vitest';
import { DkimDomainMismatchSignal } from '../../../../../src/security/signals/sender/DkimDomainMismatchSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new DkimDomainMismatchSignal();
const signedBy = (...signatures) =>
  ingestedEmail({
    auth: {
      trusted: true,
      spf: { result: 'pass', mailFrom: null },
      dkim: signatures.map(([domain, result = 'pass']) => ({ result, domain })),
      dmarc: { result: 'pass', headerFrom: 'acme-corp.com' },
    },
  });

describe('DkimDomainMismatchSignal (S3)', () => {
  it('fires when only an unrelated domain signed the email', () => {
    expect(signal.evaluate(signedBy(['sendgrid.net']), signalContext())).toMatchObject({
      id: 'S3',
      severity: 'low',
      reason: "The email is signed by sendgrid.net, not by the sender's domain acme-corp.com.",
    });
  });

  it('ignores a failed aligned signature when deciding alignment', () => {
    expect(
      signal.evaluate(signedBy(['acme-corp.com', 'fail'], ['sendgrid.net']), signalContext()),
    ).not.toBeNull();
  });

  it('does not fire when an aligned domain or subdomain signed', () => {
    expect(
      signal.evaluate(signedBy(['sendgrid.net'], ['acme-corp.com']), signalContext()),
    ).toBeNull();
    expect(signal.evaluate(signedBy(['mail.acme-corp.com']), signalContext())).toBeNull();
  });

  it('leaves unsigned email to S2', () => {
    expect(signal.evaluate(signedBy(), signalContext())).toBeNull();
  });
});

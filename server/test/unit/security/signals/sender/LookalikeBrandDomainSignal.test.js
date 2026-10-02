import { describe, expect, it } from 'vitest';
import { BrandList } from '../../../../../src/security/signals/BrandList.js';
import { Confusables } from '../../../../../src/security/signals/Confusables.js';
import { DomainSimilarity } from '../../../../../src/security/signals/DomainSimilarity.js';
import { LookalikeBrandDomainSignal } from '../../../../../src/security/signals/sender/LookalikeBrandDomainSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const confusables = new Confusables();
const signal = new LookalikeBrandDomainSignal(
  new DomainSimilarity(confusables),
  new BrandList(confusables),
);
const evaluate = (address) =>
  signal.evaluate(ingestedEmail({ from: { address, name: null } }), signalContext());

describe('LookalikeBrandDomainSignal (S6)', () => {
  it('catches a near-copy of a brand domain', () => {
    expect(evaluate('billing@netfIix.com')).toMatchObject({
      id: 'S6',
      severity: 'medium',
      reason: 'The sender domain netfiix.com looks like netflix.com (Netflix).',
    });
  });

  it('catches a brand name used in a domain the brand does not own', () => {
    expect(evaluate('billing@netflix-account-help.com')?.reason).toBe(
      'The sender domain netflix-account-help.com uses the name Netflix but does not belong to Netflix.',
    );
    expect(evaluate('x@secure.paypal.com.evil.example')?.reason).toMatch(/uses the name PayPal/);
  });

  it('catches homoglyph and misspelled brand words', () => {
    expect(evaluate('x@xn--pypal-4ve.com')).not.toBeNull();
    expect(evaluate('orders@amazn-orders.com')?.reason).toMatch(/Amazon/);
  });

  it('does not fire for the brand itself or its subdomains', () => {
    expect(evaluate('info@account.netflix.com')).toBeNull();
    expect(evaluate('no-reply@amazon.co.uk')).toBeNull();
  });

  it('does not fire for free-mail or unrelated domains', () => {
    expect(evaluate('someone@gmail.com')).toBeNull();
    expect(evaluate('someone@outlook.com')).toBeNull();
    expect(evaluate('rahul@acme-corp.com')).toBeNull();
    expect(evaluate('team@ubs.com')).toBeNull();
    expect(evaluate('hello@groups.io')).toBeNull();
  });
});

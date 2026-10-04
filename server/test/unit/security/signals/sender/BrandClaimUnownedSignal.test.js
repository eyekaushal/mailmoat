import { describe, expect, it } from 'vitest';
import { BrandList } from '../../../../../src/security/signals/BrandList.js';
import { Confusables } from '../../../../../src/security/signals/Confusables.js';
import { BrandClaimUnownedSignal } from '../../../../../src/security/signals/sender/BrandClaimUnownedSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new BrandClaimUnownedSignal(new BrandList(new Confusables()));
const evaluate = (address, claimedBrand) =>
  signal.evaluate(
    ingestedEmail({ from: { address, name: 'Billing' } }),
    signalContext({}, claimedBrand === undefined ? null : { claimed_brand: claimedBrand }),
  );

describe('BrandClaimUnownedSignal (S22)', () => {
  it('fires when the Reader read a listed brand claim on a domain the brand does not use', () => {
    expect(evaluate('billing@defender-billing.example', 'Microsoft Defender')).toMatchObject({
      id: 'S22',
      severity: 'medium',
      reason:
        'The email presents itself as Microsoft, but comes from defender-billing.example, which Microsoft does not use.',
    });
    expect(evaluate('alerts@hdfc-secure-alerts.example', 'HDFC Bank')).not.toBeNull();
  });

  it("stays quiet for the brand's own domains, unlisted names and no claim", () => {
    expect(evaluate('auto-confirm@amazon.in', 'Amazon.in')).toBeNull();
    expect(evaluate('noreply@github.com', 'GitHub')).toBeNull();
    expect(evaluate('tickets@jsconfindia.example', 'JSConf India')).toBeNull();
    expect(evaluate('no-reply@cloudnest.dev', 'CloudNest')).toBeNull();
    expect(evaluate('x@evil.example', null)).toBeNull();
    expect(evaluate('x@evil.example', undefined)).toBeNull();
  });
});

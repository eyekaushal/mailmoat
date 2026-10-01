import { describe, expect, it } from 'vitest';
import { FreemailClaimsOrgSignal } from '../../../../../src/security/signals/sender/FreemailClaimsOrgSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new FreemailClaimsOrgSignal();
const from = (address, name) => ingestedEmail({ from: { address, name } });

describe('FreemailClaimsOrgSignal (S11)', () => {
  it.each(['Rahul Mehta (CEO)', 'Acme Payroll', 'Acme Corp Billing', 'PayPal Support'])(
    'fires for a free-mail sender named %s',
    (name) => {
      expect(signal.evaluate(from('x@gmail.com', name), signalContext())).toMatchObject({
        id: 'S11',
        severity: 'medium',
      });
    },
  );

  it('fires when the Reader says the email claims a role', () => {
    const result = signal.evaluate(
      from('x@outlook.com', 'Rahul'),
      signalContext({}, { claims_to_be: 'it_support' }),
    );
    expect(result?.reason).toBe(
      'The email presents itself as IT support but uses a free outlook.com address.',
    );
  });

  it('does not fire for an ordinary personal name or a missing claim', () => {
    expect(
      signal.evaluate(
        from('x@gmail.com', 'Rahul Mehta'),
        signalContext({}, { claims_to_be: 'none' }),
      ),
    ).toBeNull();
    expect(signal.evaluate(from('x@gmail.com', 'Directorate fan'), signalContext())).toBeNull();
  });

  it('does not fire for a company domain', () => {
    expect(
      signal.evaluate(from('ceo@acme-corp.com', 'Rahul Mehta (CEO)'), signalContext()),
    ).toBeNull();
  });
});

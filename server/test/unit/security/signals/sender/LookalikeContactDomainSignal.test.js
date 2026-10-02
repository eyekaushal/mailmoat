import { describe, expect, it } from 'vitest';
import { Confusables } from '../../../../../src/security/signals/Confusables.js';
import { DomainSimilarity } from '../../../../../src/security/signals/DomainSimilarity.js';
import { LookalikeContactDomainSignal } from '../../../../../src/security/signals/sender/LookalikeContactDomainSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new LookalikeContactDomainSignal(new DomainSimilarity(new Confusables()));
const from = (address) => ingestedEmail({ from: { address, name: 'Rahul Mehta (CEO)' } });
const context = signalContext({
  'rahul@acme-corp.com': { sentCount: 4 },
  'friend@gmail.com': { sentCount: 2 },
  'x@acne-corp.com': { receivedCount: 9 },
});

describe('LookalikeContactDomainSignal (S5)', () => {
  it('catches the BEC lookalike acme-c0rp.com', () => {
    expect(signal.evaluate(from('rahul@acme-c0rp.com'), context)).toEqual({
      id: 'S5',
      name: 'LOOKALIKE_CONTACT_DOMAIN',
      severity: 'high',
      reason: 'The sender domain acme-c0rp.com looks like acme-corp.com, a domain you email.',
    });
  });

  it('catches a lookalike of a free-mail domain the user writes to', () => {
    expect(signal.evaluate(from('friend@gmai1.com'), context)).not.toBeNull();
  });

  it('does not fire for the real domain or its subdomains', () => {
    expect(signal.evaluate(from('rahul@acme-corp.com'), context)).toBeNull();
    expect(signal.evaluate(from('rahul@mail.acme-corp.com'), context)).toBeNull();
  });

  it('does not fire for a lookalike of a domain the user only received from', () => {
    expect(
      signal.evaluate(
        from('x@acnecorp.com'),
        signalContext({ 'x@acne-corp.com': { receivedCount: 9 } }),
      ),
    ).toBeNull();
  });

  it('does not treat one free-mail provider as a lookalike of another', () => {
    expect(signal.evaluate(from('someone@hotmail.com'), context)).toBeNull();
  });

  it('does not fire when the user also writes to the similar domain', () => {
    const both = signalContext({
      'a@acme-corp.com': { sentCount: 1 },
      'b@acme-corp.co': { sentCount: 1 },
    });
    expect(signal.evaluate(from('b@acme-corp.co'), both)).toBeNull();
  });
});

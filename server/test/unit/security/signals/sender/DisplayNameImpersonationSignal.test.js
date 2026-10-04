import { describe, expect, it } from 'vitest';
import { BrandList } from '../../../../../src/security/signals/BrandList.js';
import { Confusables } from '../../../../../src/security/signals/Confusables.js';
import { DisplayNameImpersonationSignal } from '../../../../../src/security/signals/sender/DisplayNameImpersonationSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const confusables = new Confusables();
const signal = new DisplayNameImpersonationSignal(new BrandList(confusables), confusables);
const from = (name, address) => ingestedEmail({ from: { name, address } });
const context = signalContext({
  'rahul@acme-corp.com': { sentCount: 3, name: 'Rahul Mehta' },
  'sam@partner.io': { sentCount: 1, name: 'Sam' },
});

describe('DisplayNameImpersonationSignal (S7)', () => {
  it('catches a brand display name on a domain the brand does not use', () => {
    expect(signal.evaluate(from('Netflix', 'billing@netflix-account-help.com'), context)).toEqual({
      id: 'S7',
      name: 'DISPLAY_NAME_IMPERSONATION',
      severity: 'medium',
      reason:
        'The sender name says Netflix, but the email comes from netflix-account-help.com, which Netflix does not use.',
    });
  });

  it('catches brand names on free-mail accounts and with homoglyphs', () => {
    expect(
      signal.evaluate(from('Microsoft Support', 'helpdesk@outlook.com'), context),
    ).not.toBeNull();
    expect(signal.evaluate(from('PayPaI', 'x@evil.example'), context)).not.toBeNull();
  });

  it("catches a contact's full name on another domain", () => {
    expect(
      signal.evaluate(from('Rahul Mehta (CEO)', 'rahul.ceo.office@gmail.com'), context)?.reason,
    ).toBe(
      'The sender name matches your contact Rahul Mehta, but this email comes from gmail.com, not acme-corp.com.',
    );
  });

  it('catches an email address shown as the display name', () => {
    expect(signal.evaluate(from('rahul@acme-corp.com', 'x@evil.example'), context)?.reason).toBe(
      'The sender name shows rahul@acme-corp.com, but the email comes from x@evil.example.',
    );
  });

  it('does not fire for genuine senders', () => {
    expect(signal.evaluate(from('Netflix', 'info@mailer.netflix.com'), context)).toBeNull();
    expect(signal.evaluate(from('Rahul Mehta', 'rahul@acme-corp.com'), context)).toBeNull();
    expect(signal.evaluate(from('Rahul Mehta', 'rahul@mail.acme-corp.com'), context)).toBeNull();
    expect(signal.evaluate(from('x@evil.example', 'x@evil.example'), context)).toBeNull();
  });

  it('does not match first names alone or unrelated names', () => {
    expect(signal.evaluate(from('Sam', 'sam@other.example'), context)).toBeNull();
    expect(signal.evaluate(from('Rahul Sharma', 'rahul@other.example'), context)).toBeNull();
    expect(signal.evaluate(from('Edward Norton', 'ed@studio.example'), context)).toBeNull();
  });

  it('does not use contact names for an address the user writes to', () => {
    const both = signalContext({
      'rahul@acme-corp.com': { sentCount: 3, name: 'Rahul Mehta' },
      'rahul.mehta@gmail.com': { sentCount: 1 },
    });
    expect(signal.evaluate(from('Rahul Mehta', 'rahul.mehta@gmail.com'), both)).toBeNull();
  });

  it("lets a platform relay carry a contact's name when DMARC proves the platform", () => {
    const relay = (dmarc) =>
      ingestedEmail({
        from: {
          name: 'Rahul Mehta (via Google Drive)',
          address: 'drive-shares-noreply@google.com',
        },
        auth: { ...ingestedEmail().auth, dmarc: { result: dmarc, headerFrom: 'google.com' } },
      });
    expect(signal.evaluate(relay('pass'), context)).toBeNull();
    expect(signal.evaluate(relay('fail'), context)?.reason).toMatch(
      /matches your contact Rahul Mehta/,
    );
  });
});

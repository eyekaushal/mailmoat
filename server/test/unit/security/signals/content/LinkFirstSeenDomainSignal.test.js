import { describe, expect, it } from 'vitest';
import { BrandList } from '../../../../../src/security/signals/BrandList.js';
import { Confusables } from '../../../../../src/security/signals/Confusables.js';
import { LinkFirstSeenDomainSignal } from '../../../../../src/security/signals/content/LinkFirstSeenDomainSignal.js';
import { ingestedEmail, link, signalContext } from '../fixtures.js';

const signal = new LinkFirstSeenDomainSignal(new BrandList(new Confusables()));
const context = signalContext({
  'rahul@acme-corp.com': { sentCount: 1 },
  'x@stranger.example': { receivedCount: 4 },
});
const evaluate = (...hrefs) =>
  signal.evaluate(ingestedEmail({ links: hrefs.map((h) => link(h)) }), context);

describe('LinkFirstSeenDomainSignal (S18)', () => {
  it('lists unseen link domains', () => {
    expect(
      evaluate('https://login.evil.example/a', 'https://evil.example/b', 'https://other.example/'),
    ).toMatchObject({
      id: 'S18',
      severity: 'low',
      reason: 'Links go to domains you have never emailed: evil.example, other.example.',
    });
  });

  it('caps the list', () => {
    expect(
      evaluate(...['a', 'b', 'c', 'd', 'e'].map((d) => `https://${d}.example/`))?.reason,
    ).toMatch(/a\.example, b\.example, c\.example and 2 more\.$/);
  });

  it('treats domains the user wrote to and bundled brands as seen', () => {
    expect(
      evaluate('https://docs.acme-corp.com/x', 'https://www.paypal.com/', 'mailto:a@b.example'),
    ).toBeNull();
  });

  it('does not count domains the user only received mail from', () => {
    expect(evaluate('https://stranger.example/')).not.toBeNull();
  });

  it("treats the sender's own DMARC-aligned domain as seen", () => {
    const bill = (dmarc) =>
      ingestedEmail({
        from: { address: 'ebill@tatapower-bills.example', name: 'Tata Power' },
        auth: {
          ...ingestedEmail().auth,
          dmarc: { result: dmarc, headerFrom: 'tatapower-bills.example' },
        },
        links: [link('https://tatapower-bills.example/pay/1')],
      });
    expect(signal.evaluate(bill('pass'), context)).toBeNull();
    expect(signal.evaluate(bill('fail'), context)).not.toBeNull();
  });
});

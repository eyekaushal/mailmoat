import { describe, expect, it } from 'vitest';
import { BrandList } from '../../../../../src/security/signals/BrandList.js';
import { Confusables } from '../../../../../src/security/signals/Confusables.js';
import { LinkTextHrefMismatchSignal } from '../../../../../src/security/signals/content/LinkTextHrefMismatchSignal.js';
import { ingestedEmail, link, signalContext } from '../fixtures.js';

const signal = new LinkTextHrefMismatchSignal(new BrandList(new Confusables()));
const context = signalContext({ 'rahul@acme-corp.com': { sentCount: 1 } });
const evaluate = (links, overrides = {}) =>
  signal.evaluate(ingestedEmail({ links, ...overrides }), context);

describe('LinkTextHrefMismatchSignal (S14)', () => {
  it.each([
    ['https://paypal.com/login', 'https://evil.example/login', 'paypal.com', 'evil.example'],
    ['www.paypal.com', 'https://evil.example/', 'paypal.com', 'evil.example'],
    ['Log in at PayPal.com today', 'https://evil.example/', 'paypal.com', 'evil.example'],
    ['partner.io/invoices.', 'http://203.0.113.9/inv', 'partner.io', '203.0.113.9'],
  ])('fires when the text shows %s but the href is %s', (text, href, shown, host) => {
    expect(evaluate([link(href, text)])).toMatchObject({
      id: 'S14',
      reason: `A link shows ${shown} but actually goes to ${host}.`,
    });
  });

  it('fires when the href starts with a real domain that is only a subdomain', () => {
    expect(
      evaluate([link('https://netflix.com.account-verify.example/login', 'Update payment')])
        ?.reason,
    ).toBe(
      'The link address netflix.com.account-verify.example starts with netflix.com but really belongs to account-verify.example.',
    );
    expect(evaluate([link('https://acme-corp.com.files.example/x', 'Open')])).not.toBeNull();
  });

  it('fires when a real domain sits in the middle of the host, behind its own subdomain', () => {
    expect(
      evaluate([link('https://login.microsoftonline.com.verify-session.example/', 'Keep')])?.reason,
    ).toBe(
      'The link address login.microsoftonline.com.verify-session.example contains microsoftonline.com but really belongs to verify-session.example.',
    );
    expect(
      evaluate([link('https://drive.google.com.share-view.example/d/1', 'Open')]),
    ).not.toBeNull();
    // The brand's own subdomains are fine.
    expect(evaluate([link('https://login.microsoftonline.com/common', 'Sign in')])).toBeNull();
  });

  it('accepts a newsletter that shows its own domain through a click tracker, if DMARC passed', () => {
    const tracked = [link('https://click.tracker.example/abc', 'www.acme-corp.com')];
    expect(evaluate(tracked)).toBeNull();
    const spoofed = ingestedEmail().auth;
    expect(
      evaluate(tracked, { auth: { ...spoofed, dmarc: { result: 'fail', headerFrom: null } } }),
    ).not.toBeNull();
  });

  it('does not fire for honest links', () => {
    expect(
      evaluate([
        link('https://www.paypal.com/signin', 'paypal.com'),
        link('https://help.acme-corp.com/x', 'Read more'),
        link('mailto:billing@paypal.com', 'billing@evil.example'),
        link('https://paypal.com/x', 'https://paypal.com/x', 'text'),
        link('https://news.example/', 'Version 2.0 is here'),
      ]),
    ).toBeNull();
  });
});

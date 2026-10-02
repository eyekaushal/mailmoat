import { describe, expect, it } from 'vitest';
import { LinkIpLiteralSignal } from '../../../../../src/security/signals/content/LinkIpLiteralSignal.js';
import { ingestedEmail, link, signalContext } from '../fixtures.js';

const signal = new LinkIpLiteralSignal();
const evaluate = (href) => signal.evaluate(ingestedEmail({ links: [link(href)] }), signalContext());

describe('LinkIpLiteralSignal (S16)', () => {
  it.each([
    ['http://203.0.113.9/login', '203.0.113.9'],
    ['http://3405803785/login', '203.0.113.9'],
    ['http://0xcb.0x0.0x71.0x9/', '203.0.113.9'],
    ['http://[2001:db8::1]/x', '[2001:db8::1]'],
  ])('fires for %s', (href, shown) => {
    expect(evaluate(href)).toMatchObject({
      id: 'S16',
      reason: `A link points to a raw IP address (${shown}) instead of a domain name.`,
    });
  });

  it('does not fire for domain names', () => {
    expect(evaluate('https://203-0-113-9.example.com/')).toBeNull();
    expect(evaluate('https://example.com/203.0.113.9')).toBeNull();
  });
});

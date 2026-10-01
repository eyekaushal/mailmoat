import { describe, expect, it } from 'vitest';
import { LinkUserinfoTrickSignal } from '../../../../../src/security/signals/content/LinkUserinfoTrickSignal.js';
import { ingestedEmail, link, signalContext } from '../fixtures.js';

const signal = new LinkUserinfoTrickSignal();
const evaluate = (href, source = 'html') =>
  signal.evaluate(ingestedEmail({ links: [link(href, 'x', source)] }), signalContext());

describe('LinkUserinfoTrickSignal (S17)', () => {
  it('fires for https://paypal.com@evil.example/', () => {
    expect(evaluate('https://paypal.com@evil.example/')).toEqual({
      id: 'S17',
      name: 'LINK_USERINFO_TRICK',
      severity: 'high',
      reason: 'A link is disguised: it starts with "paypal.com" but really goes to evil.example.',
    });
  });

  it('fires for user:password forms, malformed encodings and plain-text links', () => {
    expect(evaluate('https://www.bank.com:secure@evil.example/')).not.toBeNull();
    expect(evaluate('https://%E0%A4%A@evil.example/')).not.toBeNull();
    expect(evaluate('https://paypal.com@evil.example/', 'text')).not.toBeNull();
  });

  it('does not fire for normal links, @ in the path or mailto', () => {
    expect(evaluate('https://evil.example/')).toBeNull();
    expect(evaluate('https://medium.com/@author/post')).toBeNull();
    expect(evaluate('mailto:user@example.com')).toBeNull();
  });
});

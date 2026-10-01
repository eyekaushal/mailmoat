import { describe, expect, it } from 'vitest';
import { LinkShortenerSignal } from '../../../../../src/security/signals/content/LinkShortenerSignal.js';
import { ingestedEmail, link, signalContext } from '../fixtures.js';

const signal = new LinkShortenerSignal();
const evaluate = (...hrefs) =>
  signal.evaluate(ingestedEmail({ links: hrefs.map((h) => link(h)) }), signalContext());

describe('LinkShortenerSignal (S15)', () => {
  it('fires for known shorteners', () => {
    expect(evaluate('https://bit.ly/3abc')).toMatchObject({
      id: 'S15',
      severity: 'low',
      reason: 'A link uses the URL shortener bit.ly, which hides where it really goes.',
    });
    expect(evaluate('https://example.com', 'https://www.tinyurl.com/x')).not.toBeNull();
  });

  it('does not fire for ordinary or look-alike hosts', () => {
    expect(
      evaluate('https://example.com/bit.ly', 'https://notbit.ly/x', 'mailto:a@bit.ly'),
    ).toBeNull();
  });
});

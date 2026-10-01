import { describe, expect, it } from 'vitest';
import { HiddenTextPresentSignal } from '../../../../../src/security/signals/content/HiddenTextPresentSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new HiddenTextPresentSignal();
const withHidden = (...hidden) => ingestedEmail({ hidden });
const words = (count) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ');

describe('HiddenTextPresentSignal (S12)', () => {
  it('fires for a substantial amount of CSS-hidden text', () => {
    const email = withHidden(
      { technique: 'display_none', text: words(12) },
      { technique: 'color_matches_background', text: words(8) },
    );
    expect(signal.evaluate(email, signalContext())).toMatchObject({
      id: 'S12',
      severity: 'medium',
      reason: 'The email contains 20 words of text hidden from you.',
    });
  });

  it('fires for bidi override characters', () => {
    const email = withHidden({ technique: 'bidi_control', text: 'U+202E x1' });
    expect(signal.evaluate(email, signalContext())).not.toBeNull();
  });

  it('ignores a short hidden preheader and zero-width padding', () => {
    const email = withHidden(
      { technique: 'display_none', text: 'Our autumn sale starts today - up to 50% off' },
      { technique: 'zero_width', text: 'U+200C x120' },
    );
    expect(signal.evaluate(email, signalContext())).toBeNull();
  });

  it('ignores comments, alt text and bidi embeddings used by right-to-left languages', () => {
    const email = withHidden(
      { technique: 'html_comment', text: words(40) },
      { technique: 'attribute_text', text: words(30) },
      { technique: 'bidi_control', text: 'U+202B x4, U+202C x4' },
    );
    expect(signal.evaluate(email, signalContext())).toBeNull();
  });
});

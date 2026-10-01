import { describe, expect, it } from 'vitest';
import { Confusables } from '../../../../src/security/signals/Confusables.js';

const confusables = new Confusables();

describe('Confusables', () => {
  it.each([
    ['раypal', 'paypal'], // Cyrillic р and а
    ['paypaI', 'paypal'], // capital i
    ['acme-c0rp', 'acme-corp'], // digit zero
    ['rnicrosoft', 'microsoft'], // rn looks like m
    ['ＰａｙＰａｌ', 'paypal'], // full-width
  ])('%s has the same skeleton as %s', (lookalike, genuine) => {
    expect(confusables.skeleton(lookalike)).toBe(confusables.skeleton(genuine));
  });

  it('keeps genuinely different strings apart', () => {
    expect(confusables.skeleton('acme')).not.toBe(confusables.skeleton('acne'));
    expect(confusables.skeleton('paypal')).not.toBe(confusables.skeleton('paypai'));
  });
});

import { Signal } from '../Signal.js';

const CSS_TECHNIQUES = new Set([
  'display_none',
  'visibility_hidden',
  'opacity_zero',
  'tiny_font',
  'offscreen',
  'clipped',
  'color_matches_background',
]);
// Marketing mail routinely hides a one-line inbox preview ("preheader") and pads it with
// zero-width characters; that alone must not flag every newsletter. Real hidden payloads are longer.
const MIN_HIDDEN_WORDS = 20;

/**
 * S12: the email hides a meaningful amount of text from the reader, or uses bidi overrides that
 * reverse how text is displayed. Instruction-like hidden text is S13's job.
 */
export class HiddenTextPresentSignal extends Signal {
  constructor() {
    super({ id: 'S12', name: 'HIDDEN_TEXT_PRESENT', severity: 'medium' });
  }

  evaluate(email) {
    // Embeddings and isolates are routine in Arabic/Hebrew mail; overrides (U+202D/E) reverse text.
    const overrides = email.hidden.some(
      (item) => item.technique === 'bidi_control' && /U\+202[DE]/.test(item.text),
    );
    if (overrides) {
      return this.fire(
        'The email uses invisible direction-control characters that can disguise text.',
      );
    }
    const hiddenWords = email.hidden
      .filter((item) => CSS_TECHNIQUES.has(item.technique))
      .reduce((count, item) => count + (item.text.match(/\p{L}+/gu)?.length ?? 0), 0);
    if (hiddenWords < MIN_HIDDEN_WORDS) return null;
    return this.fire(`The email contains ${hiddenWords} words of text hidden from you.`);
  }
}

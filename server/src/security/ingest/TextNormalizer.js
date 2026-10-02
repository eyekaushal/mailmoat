// Shared with HiddenContentDetector: what it reports must be exactly what gets stripped here.
export const ZERO_WIDTH_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g;
export const BIDI_CONTROL_CHARS = /[\u202A-\u202E\u2066-\u2069]/g;

// C0/C1 control characters except tab and newline; matching them is the point.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
const MAX_READER_CHARS = 12_000;

/** Turns untrusted text into the clean, bounded form the Reader and signals work on. */
export class TextNormalizer {
  /**
   * Strips invisible and control characters, applies NFKC (so full-width or styled letters become
   * plain ones) and collapses whitespace.
   * @param {string} text
   * @returns {string}
   */
  normalize(text) {
    return text
      .replace(ZERO_WIDTH_CHARS, '')
      .replace(BIDI_CONTROL_CHARS, '')
      .normalize('NFKC')
      .replace(/\r\n?/g, '\n')
      .replace(CONTROL_CHARS, '')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Normalised text capped to bound Reader cost; the flag lets the Reader know it saw only part.
   * @param {string} text
   * @returns {{ text: string, truncated: boolean }}
   */
  forReader(text) {
    const normalized = this.normalize(text);
    return {
      text: normalized.slice(0, MAX_READER_CHARS),
      truncated: normalized.length > MAX_READER_CHARS,
    };
  }
}

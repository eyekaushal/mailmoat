import { describe, expect, it } from 'vitest';
import { TextNormalizer } from '../../../../src/security/ingest/TextNormalizer.js';

const normalizer = new TextNormalizer();

describe('TextNormalizer', () => {
  it('removes zero-width and bidi characters so split words rejoin', () => {
    expect(normalizer.normalize('ig\u200Bnore\u2060 prev\uFEFFious \u202Eexe.pdf\u202C')).toBe(
      'ignore previous exe.pdf',
    );
  });

  it('applies NFKC so full-width and styled letters become plain', () => {
    expect(normalizer.normalize('ＡＩ ａｓｓｉｓｔａｎｔ 𝐟𝐨𝐫𝐰𝐚𝐫𝐝')).toBe('AI assistant forward');
  });

  it('drops control characters but keeps line structure', () => {
    expect(normalizer.normalize('a\u0007b\r\n\r\n\r\n\r\n  c \t d  \n e')).toBe('ab\n\nc d\ne');
  });

  it('leaves ordinary text unchanged', () => {
    expect(normalizer.normalize('Hi Kaushal,\n\nCan we meet Friday at 5?')).toBe(
      'Hi Kaushal,\n\nCan we meet Friday at 5?',
    );
  });

  it('caps Reader text and flags truncation', () => {
    const long = normalizer.forReader('a'.repeat(20_000));
    expect(long.text).toHaveLength(12_000);
    expect(long.truncated).toBe(true);
    expect(normalizer.forReader('short')).toEqual({ text: 'short', truncated: false });
  });

  it('builds a one-line snippet of at most 160 characters, cut at a word', () => {
    expect(normalizer.snippet('Hi Kaushal,\n\nCan we meet\u200B Friday?')).toBe(
      'Hi Kaushal, Can we meet Friday?',
    );
    const long = normalizer.snippet(`${'word '.repeat(40)}end`);
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long).toMatch(/word…$/);
    expect(normalizer.snippet('x'.repeat(200))).toBe(`${'x'.repeat(159)}…`);
    expect(normalizer.snippet('')).toBe('');
  });
});

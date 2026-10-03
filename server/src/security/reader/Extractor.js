import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const SYSTEM_PROMPT = readFileSync(
  new URL('./prompts/extractor.system.md', import.meta.url),
  'utf8',
);
const MAX_TEXT_CHARS = 12_000;
const MAX_ITEMS = 10;

export const EXTRACT_KINDS = Object.freeze(['datetimes', 'amounts']);

const SCHEMAS = {
  datetimes: z.strictObject({
    datetimes: z.array(z.iso.datetime({ offset: true, local: true })).max(MAX_ITEMS),
  }),
  amounts: z.strictObject({
    amounts: z
      .array(z.strictObject({ value: z.number(), currency: z.string().regex(/^[A-Z]{3}$/) }))
      .max(MAX_ITEMS),
  }),
};

/**
 * The CaMeL "quarantined LLM call" behind the `extract` tool (SECURITY_APPROACH §7.5): reads
 * untrusted email text without tools and returns only values of one typed kind. Any failure
 * throws, which stops the plan (fail closed).
 */
export class Extractor {
  #llm;

  /** @param {{ llm: Pick<import('../../llm/LlmClient.js').LlmClient, 'complete'> }} deps */
  constructor({ llm }) {
    this.#llm = llm;
  }

  /**
   * @param {string} text untrusted email text
   * @param {'datetimes'|'amounts'} kind
   * @param {{ now: Date, timeZone: string }} context trusted
   * @returns {Promise<string[] | { value: number, currency: string }[]>}
   * @throws {import('../../core/errors.js').LlmError} on any model or validation failure
   */
  async extract(text, kind, { now, timeZone }) {
    const schema = SCHEMAS[kind];
    if (!schema) throw new TypeError(`Unknown extraction kind: ${kind}`);
    const result = await this.#llm.complete({
      role: 'reader',
      system: SYSTEM_PROMPT,
      user: this.#userMessage(text, kind, now, timeZone),
      schema,
    });
    return result[kind];
  }

  #userMessage(text, kind, now, timeZone) {
    const tag = `text_${randomBytes(6).toString('hex')}`;
    const shown = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
    return [
      `Now: ${now.toISOString()} (user's time zone: ${timeZone})`,
      `Extract: ${kind}`,
      text.length > MAX_TEXT_CHARS
        ? 'Note: the text was cut short; only the beginning is shown.'
        : null,
      `The untrusted text follows in the tag "${tag}".`,
      `<${tag}>\n${shown || '(empty)'}\n</${tag}>`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}

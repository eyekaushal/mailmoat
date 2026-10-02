import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ReaderFormSchema } from '@mailmoat/shared/schemas/reader-form';

const SYSTEM_PROMPT = readFileSync(new URL('./prompts/reader.system.md', import.meta.url), 'utf8');

/**
 * @typedef {import('@mailmoat/shared/schemas/reader-form').ReaderForm} ReaderForm
 * @typedef {{ failed: false, form: ReaderForm } | { failed: true, form: null, reason: string }} ReaderResult
 */

/**
 * Layer 3: the quarantined AI. It sees one email's visible text, subject and display name, and
 * nothing else; it calls the model without tools and returns only a schema-checked form.
 *
 * It never throws: any failure (network, refusal, malformed or invalid output, bug) comes back as
 * `failed: true`, which the Risk Engine treats as SUSPICIOUS (fail closed).
 */
export class Reader {
  #llm;
  #logger;

  /**
   * @param {{
   *   llm: Pick<import('../../llm/LlmClient.js').LlmClient, 'complete'>,
   *   logger: import('../../core/Logger.js').Logger,
   * }} deps
   */
  constructor({ llm, logger }) {
    this.#llm = llm;
    this.#logger = logger;
  }

  /**
   * @param {Pick<import('../ingest/EmailIngestor.js').IngestedEmail, 'subject'|'from'|'readerText'|'readerTextTruncated'>} email
   * @param {{ direction: 'inbound'|'outbound', receivedAt: Date, timeZone: string }} context
   *   trusted facts from Gmail and Settings
   * @returns {Promise<ReaderResult>}
   */
  async read(email, { direction, receivedAt, timeZone }) {
    try {
      const form = await this.#llm.complete({
        role: 'reader',
        system: SYSTEM_PROMPT,
        user: this.#userMessage(email, { direction, receivedAt, timeZone }),
        schema: ReaderFormSchema,
      });
      return {
        failed: false,
        form: {
          ...form,
          claimed_brand: form.claimed_brand?.trim() || null,
          // Defined only for the user's own mail; the model cannot set it on received mail.
          expects_reply: direction === 'outbound' && form.expects_reply,
        },
      };
    } catch (error) {
      this.#logger.warn('Reader failed; email will be treated as suspicious', {
        error: error.name,
      });
      return { failed: true, form: null, reason: 'The AI reader could not analyse this email.' };
    }
  }

  /**
   * Trusted facts first, then each untrusted field in its own tag. The random suffix means text in
   * the email cannot close the tag and pose as instructions outside it.
   */
  #userMessage(email, { direction, receivedAt, timeZone }) {
    const tag = `email_${randomBytes(6).toString('hex')}`;
    const field = (name, value) => `<${tag}_${name}>\n${value}\n</${tag}_${name}>`;
    return [
      `Direction: ${direction === 'outbound' ? 'sent by the user' : 'received by the user'}`,
      `Received: ${receivedAt.toISOString()} (user's time zone: ${timeZone})`,
      email.readerTextTruncated
        ? 'Note: the body was cut short; only the beginning is shown.'
        : null,
      `The untrusted email follows in tags starting with "${tag}".`,
      field('sender_display_name', email.from?.name ?? '(none)'),
      field('subject', email.subject || '(none)'),
      field('body', email.readerText || '(empty)'),
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}

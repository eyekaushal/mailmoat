import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DraftTextSchema } from '@mailmoat/shared/schemas/draft';

const SYSTEM_PROMPT = readFileSync(new URL('./prompts/drafter.system.md', import.meta.url), 'utf8');
const MAX_INSTRUCTION_CHARS = 1_000;

/**
 * The quarantined drafting call (SECURITY_APPROACH §7.3, PRD F6.1): writes a formal reply from one
 * email's visible text, the user's instructions and the user's name, with no tools and no other
 * data. Any failure throws, so the caller creates no draft at all (fail closed). The returned text
 * is untrusted: `DraftService` taints it to the email's participants.
 */
export class Drafter {
  #llm;

  /** @param {{ llm: Pick<import('../../llm/LlmClient.js').LlmClient, 'complete'> }} deps */
  constructor({ llm }) {
    this.#llm = llm;
  }

  /**
   * @param {object} input
   * @param {Pick<import('../ingest/EmailIngestor.js').IngestedEmail, 'subject'|'from'|'readerText'|'readerTextTruncated'>} input.email
   * @param {string | null} input.instructions what the user wants the reply to say
   * @param {string | null} input.userName for the sign-off
   * @returns {Promise<import('@mailmoat/shared/schemas/draft').DraftText>}
   * @throws {import('../../core/errors.js').LlmError} on any model or validation failure
   */
  async draft({ email, instructions, userName }) {
    return this.#llm.complete({
      role: 'drafter',
      system: SYSTEM_PROMPT,
      user: this.#userMessage(email, instructions, userName),
      schema: DraftTextSchema,
    });
  }

  /** Trusted facts first; each untrusted field in its own randomly suffixed tag (as the Reader). */
  #userMessage(email, instructions, userName) {
    const tag = `email_${randomBytes(6).toString('hex')}`;
    const field = (name, value) => `<${tag}_${name}>\n${value}\n</${tag}_${name}>`;
    return [
      `Sign off as: ${userName?.trim() || '(no name given: end after "Best regards,")'}`,
      `The user's instructions for this reply: ${
        instructions?.trim().slice(0, MAX_INSTRUCTION_CHARS) ||
        '(none given: write a short, relevant reply)'
      }`,
      email.readerTextTruncated
        ? 'Note: the body was cut short; only the beginning is shown.'
        : null,
      `The untrusted email to reply to follows in tags starting with "${tag}".`,
      field('sender_display_name', email.from?.name ?? '(none)'),
      field('subject', email.subject || '(none)'),
      field('body', email.readerText || '(empty)'),
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}

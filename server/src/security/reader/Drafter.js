import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DEFAULT_DRAFT_TONE, DRAFT_SKILLS, DRAFT_TONES } from '@mailmoat/shared/constants/drafts';
import { DraftTextSchema } from '@mailmoat/shared/schemas/draft';

const SYSTEM_PROMPT = readFileSync(new URL('./prompts/drafter.system.md', import.meta.url), 'utf8');
const MAX_INSTRUCTION_CHARS = 1_000;
const MAX_PREVIOUS_CHARS = 20_000;

/** Fixed, code-chosen tone sentences (PLAN §16.2 decision 6): never free text. */
const TONES = Object.freeze({
  formal:
    'formal: open with "Dear <name>," on its own line, complete sentences, no contractions, close with "Best regards," on its own line.',
  'semi-formal':
    'semi-formal: open with "Hello <name>," on its own line, plain friendly sentences, contractions allowed, close with "Best," on its own line.',
  casual:
    'casual: open with "Hi <name>," on its own line, short relaxed sentences as between colleagues who know each other, close with "Thanks," on its own line. Still no slang that could embarrass the user.',
});

/** What each skill asks of the previous draft (PLAN §16.2 decision 5). */
const SKILLS = Object.freeze({
  rewrite:
    "Rewrite the previous draft following the user's instructions; keep what they did not ask to change.",
  humanize:
    'Rewrite the previous draft so it reads as if the user wrote it themselves: natural, specific wording, sentences of varied length, no template phrases such as "I hope this email finds you well", "please do not hesitate" or "as per". Keep every fact, commitment and question.',
  tone: 'Rewrite the previous draft in the tone given above; keep every fact, commitment and question.',
  shorter:
    'Rewrite the previous draft at about half its length; keep every commitment and question.',
  longer:
    'Expand the previous draft only with what the email itself said or asked for; invent nothing.',
  proofread:
    'Correct grammar, spelling and punctuation in the previous draft and change nothing else.',
  complete:
    'Rewrite the previous draft so that every question or request in the email is answered or politely declined; invent nothing.',
});

/**
 * The quarantined drafting call (SECURITY_APPROACH §7.3, PRD F6.1): writes a reply from one
 * email's visible text, the user's instructions and the user's name, with no tools and no other
 * data. Since PLAN §16 it can also revise a previous draft, which it receives as one more
 * untrusted field: the user, an AI or an attacker's email may have shaped it. The tone and the
 * task are closed lists whose sentences live here, so nothing but the user's typed instruction
 * is free text. Any failure throws, so the caller creates no draft at all (fail closed). The
 * returned text is untrusted: `DraftService` taints it to the email's participants.
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
   * @param {string | null} [input.previous] the draft to revise, as the user saw it
   * @param {string | null} [input.skill] one of `DRAFT_SKILLS`; required with `previous`
   * @param {string | null} [input.tone] one of `DRAFT_TONES`; formal when not given
   * @returns {Promise<import('@mailmoat/shared/schemas/draft').DraftText>}
   * @throws {import('../../core/errors.js').LlmError} on any model or validation failure
   * @throws {RangeError} on a skill or tone outside the closed lists
   */
  async draft({ email, instructions, userName, previous = null, skill = null, tone = null }) {
    const chosenTone = tone ?? DEFAULT_DRAFT_TONE;
    if (!DRAFT_TONES.includes(chosenTone)) throw new RangeError(`Unknown tone: ${chosenTone}`);
    if (previous !== null && !DRAFT_SKILLS.includes(skill)) {
      throw new RangeError(`Unknown skill: ${skill}`);
    }
    return this.#llm.complete({
      role: 'drafter',
      system: SYSTEM_PROMPT,
      user: this.#userMessage({ email, instructions, userName, previous, skill, tone: chosenTone }),
      schema: DraftTextSchema,
    });
  }

  /** Trusted facts first; each untrusted field in its own randomly suffixed tag (as the Reader). */
  #userMessage({ email, instructions, userName, previous, skill, tone }) {
    const tag = `email_${randomBytes(6).toString('hex')}`;
    const field = (name, value) => `<${tag}_${name}>\n${value}\n</${tag}_${name}>`;
    const revising = previous !== null;
    return [
      `Sign off as: ${userName?.trim() || '(no name given: end after the closing line)'}`,
      `Tone: ${TONES[tone]}`,
      revising ? `Task: ${SKILLS[skill]}` : 'Task: write a reply to the email.',
      `The user's instructions for this reply: ${
        instructions?.trim().slice(0, MAX_INSTRUCTION_CHARS) ||
        (revising ? '(none beyond the task)' : '(none given: write a short, relevant reply)')
      }`,
      email.readerTextTruncated
        ? 'Note: the body was cut short; only the beginning is shown.'
        : null,
      `The untrusted email to reply to${revising ? ' and the previous draft' : ''} follow in tags starting with "${tag}".`,
      field('sender_display_name', email.from?.name ?? '(none)'),
      field('subject', email.subject || '(none)'),
      field('body', email.readerText || '(empty)'),
      revising ? field('previous_draft', previous.slice(0, MAX_PREVIOUS_CHARS)) : null,
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}

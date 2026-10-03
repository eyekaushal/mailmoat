import { z } from 'zod';
import { RISK_LEVELS } from '@mailmoat/shared/constants/risk-levels';
import { HANDLE_PATTERN } from '@mailmoat/shared/schemas/plan';
import {
  MAX_PROPOSED_TIMES,
  READER_CATEGORIES,
  ReaderFormSchema,
} from '@mailmoat/shared/schemas/reader-form';
import { HandleStore } from './HandleStore.js';
import { TaggedValue } from './TaggedValue.js';

/**
 * Exactly the typed fields the agent may learn about an email (SECURITY_APPROACH §7.5).
 * Strict so that a new field cannot slip through without a deliberate change here.
 */
export const EmailFactsSchema = z.strictObject({
  id: z.string().min(1),
  handles: z.strictObject({
    summary: z.string().regex(HANDLE_PATTERN),
    body: z.string().regex(HANDLE_PATTERN),
  }),
  direction: z.enum(['inbound', 'outbound']),
  from: z.strictObject({
    address: z.email().nullable(),
    domain: z
      .string()
      .regex(/^[a-z0-9.-]+$/)
      .nullable(),
  }),
  date: z.iso.datetime(),
  risk: z.strictObject({ level: z.enum(RISK_LEVELS) }).nullable(),
  category: z.enum(READER_CATEGORIES).nullable(),
  needs_reply: z.boolean().nullable(),
  intents: ReaderFormSchema.shape.intents.nullable(),
  meeting_request: z
    .strictObject({
      proposed_times: z
        .array(z.iso.datetime({ offset: true, local: true }))
        .max(MAX_PROPOSED_TIMES),
    })
    .nullable(),
});

/**
 * @typedef {z.infer<typeof EmailFactsSchema>} Facts
 * @typedef {{
 *   record: import('../sync/EmailMetadataMapper.js').EmailRecord,
 *   form: import('@mailmoat/shared/schemas/reader-form').ReaderForm | null,
 *   verdict: { level: string } | null,
 * }} StoredEmail
 */

/** Builds the typed, whitelisted view of a stored email that the Planner and tools may use. */
export class EmailFacts {
  /**
   * @param {StoredEmail} email
   * @returns {Facts}
   * @throws {z.ZodError} when stored data is not what the schema allows (a bug, never attacker input)
   */
  static from({ record, form, verdict }) {
    const address = z.email().safeParse(record.fromAddr);
    return EmailFactsSchema.parse({
      id: record.gmailId,
      handles: {
        summary: HandleStore.emailHandle(record.gmailId, 'summary'),
        body: HandleStore.emailHandle(record.gmailId, 'body'),
      },
      direction: record.direction,
      from: {
        address: address.success ? address.data : null,
        domain: address.success ? record.fromDomain : null,
      },
      date: record.date,
      risk: verdict ? { level: verdict.level } : null,
      category: form?.category ?? null,
      needs_reply: form?.needs_reply ?? null,
      intents: form?.intents ?? null,
      meeting_request: form?.meeting_request ?? null,
    });
  }

  /**
   * Who may see data taken from this email: its sender and recipients.
   * @param {import('../sync/EmailMetadataMapper.js').EmailRecord} record
   * @returns {string[]}
   */
  static participants(record) {
    return [...new Set([record.fromAddr, ...record.toAddrs].map((a) => a.toLowerCase()))];
  }

  /**
   * Tags a value as derived from this email.
   * @param {unknown} value
   * @param {import('../sync/EmailMetadataMapper.js').EmailRecord} record
   */
  static tag(value, record) {
    return TaggedValue.fromEmail(value, {
      id: record.gmailId,
      participants: EmailFacts.participants(record),
    });
  }
}

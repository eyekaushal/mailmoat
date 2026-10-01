import { z } from 'zod';

export const READER_CATEGORIES = Object.freeze([
  'personal',
  'work',
  'newsletter',
  'marketing',
  'receipt',
  'notification',
  'calendar',
  'security_alert',
  'cold_outreach',
  'other',
]);

export const READER_CLAIMS = Object.freeze([
  'none',
  'executive',
  'colleague',
  'vendor',
  'bank',
  'brand',
  'government',
  'it_support',
]);

export const MAX_SUMMARY_CHARS = 300;
export const MAX_BRAND_CHARS = 40;
export const MAX_PROPOSED_TIMES = 5;

/**
 * What the quarantined Reader may say about one email (SECURITY_APPROACH §7.3, PRD F3.4).
 * Almost everything is an enum or boolean, so a hijacked Reader can mislabel an email but cannot
 * smuggle instructions onward. Strict objects: unknown keys are rejected, not dropped.
 */
export const ReaderFormSchema = z.strictObject({
  category: z.enum(READER_CATEGORIES),
  needs_reply: z.boolean(),
  intents: z.strictObject({
    asks_for_payment: z.boolean(),
    asks_bank_detail_change: z.boolean(),
    asks_for_credentials: z.boolean(),
    asks_to_open_attachment: z.boolean(),
    asks_to_click_link: z.boolean(),
    asks_to_call_number: z.boolean(),
    asks_for_secrecy: z.boolean(),
    asks_to_change_ai_behaviour: z.boolean(),
  }),
  urgency: z.enum(['none', 'normal', 'high']),
  claims_to_be: z.enum(READER_CLAIMS),
  claimed_brand: z.string().max(MAX_BRAND_CHARS).nullable(),
  meeting_request: z
    .strictObject({
      // Local (no offset) means the user's own time zone; validated by the ISO-8601 parser.
      proposed_times: z
        .array(z.iso.datetime({ offset: true, local: true }))
        .max(MAX_PROPOSED_TIMES),
    })
    .nullable(),
  expects_reply: z.boolean(),
  summary: z.string().max(MAX_SUMMARY_CHARS),
});

/** @typedef {z.infer<typeof ReaderFormSchema>} ReaderForm */

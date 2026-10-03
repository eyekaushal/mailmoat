import { z } from 'zod';

export const MAX_DRAFT_CHARS = 4_000;

/**
 * What the quarantined Drafter may return (PRD F6.1): one plain-text body and nothing else.
 * Code adds the recipients, subject and headers; the model never names a recipient.
 */
export const DraftTextSchema = z.strictObject({
  body: z.string().trim().min(1).max(MAX_DRAFT_CHARS),
});

/** @typedef {z.infer<typeof DraftTextSchema>} DraftText */

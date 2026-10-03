import { describe, expect, it } from 'vitest';
import { DraftTextSchema, MAX_DRAFT_CHARS } from '../../src/schemas/draft.js';

describe('DraftTextSchema', () => {
  it('accepts one trimmed body and nothing else', () => {
    expect(DraftTextSchema.parse({ body: '  Dear Rahul,\n\nThank you.  ' })).toEqual({
      body: 'Dear Rahul,\n\nThank you.',
    });
    expect(DraftTextSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(DraftTextSchema.safeParse({ body: 'x'.repeat(MAX_DRAFT_CHARS + 1) }).success).toBe(
      false,
    );
    expect(DraftTextSchema.safeParse({ body: 'ok', to: 'evil@example.com' }).success).toBe(false);
    expect(DraftTextSchema.safeParse({}).success).toBe(false);
  });
});

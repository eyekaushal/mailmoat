import { describe, expect, it } from 'vitest';
import { SignalCatalog } from '../../../../src/security/signals/SignalCatalog.js';

describe('SignalCatalog', () => {
  it('builds every signal S1–S22 exactly once', () => {
    const ids = new SignalCatalog().create().map((signal) => signal.id);
    expect(ids).toEqual(Array.from({ length: 22 }, (_, i) => `S${i + 1}`));
  });
});

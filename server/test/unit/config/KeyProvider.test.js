import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KeyProvider } from '../../../src/config/KeyProvider.js';
import { SecretStoreError } from '../../../src/core/errors.js';

const tempKeyPath = () =>
  join(mkdtempSync(join(tmpdir(), 'mailmoat-key-')), 'nested', 'master.key');

describe('KeyProvider', () => {
  it('creates a 32-byte key in a file only the user can read', () => {
    const keyPath = tempKeyPath();
    const key = new KeyProvider(keyPath).getKey();
    expect(key).toHaveLength(32);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
  });

  it('returns the same key across instances (restart-safe)', () => {
    const keyPath = tempKeyPath();
    const first = new KeyProvider(keyPath).getKey();
    expect(new KeyProvider(keyPath).getKey().equals(first)).toBe(true);
  });

  it('refuses a key file other users can read', () => {
    const keyPath = tempKeyPath();
    new KeyProvider(keyPath).getKey();
    chmodSync(keyPath, 0o644);
    expect(() => new KeyProvider(keyPath).getKey()).toThrow(/readable by other users/);
  });

  it('refuses a corrupted key file instead of silently replacing it', () => {
    const keyPath = tempKeyPath();
    new KeyProvider(keyPath).getKey();
    writeFileSync(keyPath, 'not-a-key', { mode: 0o600 });
    expect(() => new KeyProvider(keyPath).getKey()).toThrow(SecretStoreError);
    expect(readFileSync(keyPath, 'utf8')).toBe('not-a-key');
  });
});

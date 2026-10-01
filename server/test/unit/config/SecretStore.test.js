import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { KeyProvider } from '../../../src/config/KeyProvider.js';
import { SecretStore } from '../../../src/config/SecretStore.js';
import { SecretStoreError } from '../../../src/core/errors.js';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';

const API_KEY = 'sk-ant-api03-example-0000000000abcd';

describe('SecretStore', () => {
  let db;
  let keyDir;
  let store;

  beforeEach(() => {
    db = new Database(':memory:');
    new Migrator(db).migrate();
    keyDir = mkdtempSync(join(tmpdir(), 'mailmoat-secrets-'));
    store = new SecretStore(db, new KeyProvider(join(keyDir, 'master.key')));
  });

  it('round-trips a secret', () => {
    store.set('anthropic_api_key', API_KEY);
    expect(store.get('anthropic_api_key')).toBe(API_KEY);
    expect(store.has('anthropic_api_key')).toBe(true);
  });

  it('never stores the plaintext in the database', () => {
    store.set('anthropic_api_key', API_KEY);
    const row = db.get('SELECT * FROM secrets WHERE name = ?', ['anthropic_api_key']);
    const stored = Buffer.concat([row.ciphertext, row.iv, row.tag]).toString('latin1');
    expect(stored).not.toContain('sk-ant');
  });

  it('uses a fresh IV each time, so equal secrets look different', () => {
    store.set('a', API_KEY);
    store.set('b', API_KEY);
    const [a, b] = db.all('SELECT ciphertext FROM secrets ORDER BY name');
    expect(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext))).toBe(false);
  });

  it('detects tampering', () => {
    store.set('google_refresh_token', 'refresh-123');
    db.run(
      "UPDATE secrets SET ciphertext = X'00' || ciphertext WHERE name = 'google_refresh_token'",
    );
    expect(() => store.get('google_refresh_token')).toThrow(SecretStoreError);
  });

  it('binds each ciphertext to its name, so rows cannot be swapped', () => {
    store.set('google_refresh_token', 'refresh-123');
    db.run("UPDATE secrets SET name = 'anthropic_api_key' WHERE name = 'google_refresh_token'");
    expect(() => store.get('anthropic_api_key')).toThrow(SecretStoreError);
  });

  it('cannot be decrypted with a different master key', () => {
    store.set('anthropic_api_key', API_KEY);
    const otherKeyDir = mkdtempSync(join(tmpdir(), 'mailmoat-other-'));
    const otherStore = new SecretStore(db, new KeyProvider(join(otherKeyDir, 'master.key')));
    expect(() => otherStore.get('anthropic_api_key')).toThrow(SecretStoreError);
  });

  it('masks secrets for display and returns null when missing', () => {
    store.set('anthropic_api_key', API_KEY);
    expect(store.masked('anthropic_api_key')).toBe('sk-ant-…abcd');
    expect(store.get('missing')).toBeNull();
    expect(store.masked('missing')).toBeNull();
  });

  it('deletes secrets and rejects empty values', () => {
    store.set('anthropic_api_key', API_KEY);
    store.delete('anthropic_api_key');
    expect(store.has('anthropic_api_key')).toBe(false);
    expect(() => store.set('anthropic_api_key', '')).toThrow(SecretStoreError);
  });
});

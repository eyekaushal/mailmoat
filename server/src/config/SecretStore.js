import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { SecretStoreError } from '../core/errors.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Encrypted storage for secrets (Anthropic key, Google refresh token) in the `secrets` table.
 * Each secret is encrypted with AES-256-GCM using a fresh IV. The secret's name is bound in as
 * additional authenticated data, so a ciphertext copied onto another row fails to decrypt.
 * Plaintext secrets are never returned to the browser; use `masked()` for display.
 */
export class SecretStore {
  #db;
  #keyProvider;
  #now;

  /**
   * @param {import('../db/Database.js').Database} db
   * @param {import('./KeyProvider.js').KeyProvider} keyProvider
   * @param {{ now?: () => Date }} [options]
   */
  constructor(db, keyProvider, { now = () => new Date() } = {}) {
    this.#db = db;
    this.#keyProvider = keyProvider;
    this.#now = now;
  }

  /**
   * @param {string} name
   * @param {string} plaintext
   */
  set(name, plaintext) {
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
      throw new SecretStoreError(`Secret "${name}" must be a non-empty string`);
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.#keyProvider.getKey(), iv);
    cipher.setAAD(Buffer.from(name, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    this.#db.run(
      `INSERT INTO secrets (name, ciphertext, iv, tag, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET ciphertext = excluded.ciphertext, iv = excluded.iv,
         tag = excluded.tag, updated_at = excluded.updated_at`,
      [name, ciphertext, iv, cipher.getAuthTag(), this.#now().toISOString()],
    );
  }

  /**
   * @param {string} name
   * @returns {string | null}
   */
  get(name) {
    const row = this.#db.get('SELECT ciphertext, iv, tag FROM secrets WHERE name = ?', [name]);
    if (!row) return null;
    try {
      const decipher = createDecipheriv(ALGORITHM, this.#keyProvider.getKey(), row.iv);
      decipher.setAAD(Buffer.from(name, 'utf8'));
      decipher.setAuthTag(row.tag);
      return Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString('utf8');
    } catch (error) {
      throw new SecretStoreError(`Secret "${name}" could not be decrypted`, { cause: error });
    }
  }

  /** @param {string} name */
  has(name) {
    return Boolean(this.#db.get('SELECT 1 AS found FROM secrets WHERE name = ?', [name]));
  }

  /** @param {string} name */
  delete(name) {
    this.#db.run('DELETE FROM secrets WHERE name = ?', [name]);
  }

  /**
   * Display form for the UI, e.g. "sk-ant-…abcd".
   * @param {string} name
   * @returns {string | null}
   */
  masked(name) {
    const value = this.get(name);
    if (value === null) return null;
    if (value.length <= 12) return '…' + value.slice(-2);
    return `${value.slice(0, 7)}…${value.slice(-4)}`;
  }
}

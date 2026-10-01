import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { SecretStoreError } from '../core/errors.js';

const KEY_BYTES = 32; // AES-256

/**
 * Supplies the master key that encrypts every stored secret.
 * The key lives in its own file in the data folder, readable only by the current user
 * (mode 0600). OS-keychain storage is a possible later upgrade; the interface stays the same.
 */
export class KeyProvider {
  #keyPath;
  #platform;
  #cachedKey;

  /**
   * @param {string} keyPath e.g. `<dataDir>/master.key`
   * @param {{ platform?: NodeJS.Platform }} [options]
   */
  constructor(keyPath, { platform = process.platform } = {}) {
    this.#keyPath = keyPath;
    this.#platform = platform;
  }

  /** @returns {Buffer} 32-byte key; created on first use */
  getKey() {
    this.#cachedKey ??= this.#readKey() ?? this.#createKey();
    return this.#cachedKey;
  }

  #readKey() {
    let encoded;
    try {
      encoded = readFileSync(this.#keyPath, 'utf8').trim();
    } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw new SecretStoreError('Could not read the master key file', { cause: error });
    }
    this.#assertPrivate();
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== KEY_BYTES) throw new SecretStoreError('Master key file is corrupted');
    return key;
  }

  #createKey() {
    const key = randomBytes(KEY_BYTES);
    mkdirSync(dirname(this.#keyPath), { recursive: true, mode: 0o700 });
    try {
      // 'wx' fails if another process created the file first, so we never overwrite a key.
      writeFileSync(this.#keyPath, key.toString('base64'), { mode: 0o600, flag: 'wx' });
    } catch (error) {
      if (error.code === 'EEXIST') return this.#readKey();
      throw new SecretStoreError('Could not create the master key file', { cause: error });
    }
    chmodSync(this.#keyPath, 0o600);
    return key;
  }

  #assertPrivate() {
    if (this.#platform === 'win32') return; // POSIX permission bits do not apply
    const mode = statSync(this.#keyPath).mode & 0o777;
    if (mode & 0o077) {
      throw new SecretStoreError(
        `Master key file is readable by other users (mode ${mode.toString(8)}); run: chmod 600 "${this.#keyPath}"`,
      );
    }
  }
}

import Anthropic from '@anthropic-ai/sdk';
import { LlmError } from '../core/errors.js';

const SECRET_NAME = 'anthropic_api_key';

/**
 * The user's Anthropic account: which API key is in force and an SDK client built from it.
 *
 * The key saved through Settings wins over `.env` (PRD F1.7) and may change while the app runs,
 * so `LlmClient` holds this provider instead of a fixed SDK instance: `messages` / `beta` resolve
 * the current key on every call. The key never leaves the server; only `masked()` is shown.
 */
export class AnthropicProvider {
  #secretStore;
  #envKey;
  #create;
  #client;
  #clientKey;

  /**
   * @param {{
   *   secretStore: Pick<import('../config/SecretStore.js').SecretStore, 'get'|'set'|'has'|'delete'|'masked'>,
   *   envKey?: string,
   *   create?: (apiKey: string) => Anthropic,
   * }} deps `create` is injectable for tests
   */
  constructor({
    secretStore,
    envKey,
    create = (apiKey) => new Anthropic({ apiKey, maxRetries: 3, timeout: 60_000 }),
  }) {
    this.#secretStore = secretStore;
    this.#envKey = envKey;
    this.#create = create;
  }

  /** @returns {boolean} */
  isConfigured() {
    return this.#apiKey() !== null;
  }

  /** @returns {'settings'|'env'|null} where the key in force comes from */
  source() {
    if (this.#secretStore.has(SECRET_NAME)) return 'settings';
    return this.#envKey ? 'env' : null;
  }

  /** @returns {string | null} e.g. `sk-ant-…abcd`; the only form the UI ever sees (F1.2) */
  masked() {
    const stored = this.#secretStore.masked(SECRET_NAME);
    if (stored) return stored;
    return this.#envKey ? AnthropicProvider.#mask(this.#envKey) : null;
  }

  /** @param {string} apiKey */
  setKey(apiKey) {
    this.#secretStore.set(SECRET_NAME, apiKey);
  }

  clearKey() {
    this.#secretStore.delete(SECRET_NAME);
  }

  /**
   * A minimal, free API call that proves the key works (F1.1 "Test key").
   * @param {string} [apiKey] defaults to the key in force
   * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
   */
  async test(apiKey = this.#apiKey()) {
    if (!apiKey) return { ok: false, reason: 'No API key to test' };
    try {
      await this.#create(apiKey).models.list({ limit: 1 });
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: AnthropicProvider.#describe(error) };
    }
  }

  /** The SDK's `messages` namespace, bound to the current key. */
  get messages() {
    return this.#sdk().messages;
  }

  /** The SDK's `beta` namespace, bound to the current key. */
  get beta() {
    return this.#sdk().beta;
  }

  #apiKey() {
    return this.#secretStore.get(SECRET_NAME) ?? this.#envKey ?? null;
  }

  #sdk() {
    const apiKey = this.#apiKey();
    if (!apiKey) throw new LlmError('No Anthropic API key is configured');
    if (apiKey !== this.#clientKey) {
      this.#client = this.#create(apiKey);
      this.#clientKey = apiKey;
    }
    return this.#client;
  }

  static #mask(key) {
    return `${key.slice(0, 7)}…${key.slice(-4)}`;
  }

  /** Status and type only: SDK error messages can echo request details. */
  static #describe(error) {
    if (error?.status === 401) return 'Anthropic rejected the key (401)';
    if (error?.status === 403) return 'The key is not allowed to use the API (403)';
    if (typeof error?.status === 'number') return `Anthropic answered HTTP ${error.status}`;
    return 'Could not reach the Anthropic API';
  }
}

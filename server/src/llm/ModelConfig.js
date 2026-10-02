import { z } from 'zod';
import { ConfigError } from '../core/errors.js';

/** USD per million tokens. Cache writes are 1.25× input (5-minute TTL), cache reads as published. */
const PRICES = {
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
};
// Models that take `effort` and support the server-side refusal fallback; Haiku 4.5 rejects both.
const CURRENT_GENERATION = new Set(['claude-sonnet-5-5', 'claude-opus-5-5']);

const overridesSchema = z.object({
  plannerModel: z.enum(['claude-opus-5-5', 'claude-sonnet-5-5']).default('claude-opus-5-5'),
  drafterModel: z.enum(['claude-haiku-4-5', 'claude-sonnet-5-5']).default('claude-haiku-4-5'),
});

/**
 * @typedef {'reader'|'drafter'|'planner'} LlmRole
 * @typedef {{ model: string, maxTokens: number, effort: 'low'|'medium'|'high' | null, fallback: boolean }} RoleSettings
 */

/** Which model each AI role uses (PRD §14), plus prices for cost estimates. */
export class ModelConfig {
  #roles;

  /**
   * @param {{ plannerModel?: string, drafterModel?: string }} [overrides] from Settings (PRD F1.6)
   * @throws {ConfigError} for a model that is not offered for that role
   */
  constructor(overrides = {}) {
    const parsed = overridesSchema.safeParse(overrides);
    if (!parsed.success) throw new ConfigError(`Invalid model settings: ${parsed.error.message}`);
    const { plannerModel, drafterModel } = parsed.data;
    this.#roles = {
      // The Reader returns a small form; a low cap also bounds what a hijacked Reader can write.
      reader: this.#settings('claude-haiku-4-5', 1_024, null),
      drafter: this.#settings(drafterModel, 2_048, 'low'),
      planner: this.#settings(plannerModel, 8_000, 'medium'),
    };
  }

  /**
   * @param {LlmRole} role
   * @returns {RoleSettings}
   */
  forRole(role) {
    const settings = this.#roles[role];
    if (!settings) throw new ConfigError(`Unknown LLM role: ${role}`);
    return settings;
  }

  /**
   * Estimated USD cost, or null for a model without a known price (e.g. a fallback model).
   * @param {string} model
   * @param {{ input_tokens: number, output_tokens: number, cache_creation_input_tokens?: number | null, cache_read_input_tokens?: number | null }} usage
   * @returns {number | null}
   */
  costUsd(model, usage) {
    const price = PRICES[model];
    if (!price) return null;
    const total =
      usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead;
    return total / 1_000_000;
  }

  #settings(model, maxTokens, effort) {
    const current = CURRENT_GENERATION.has(model);
    return { model, maxTokens, effort: current ? effort : null, fallback: current };
  }
}

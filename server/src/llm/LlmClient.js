import { z } from 'zod';
import { LlmError, LlmOutputError, LlmRefusalError } from '../core/errors.js';

// Structured outputs reject these JSON Schema keywords; Zod re-checks them after the call.
const UNSUPPORTED_KEYWORDS = [
  '$schema',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
];
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * The single place mailmoat talks to Anthropic (PRD §14).
 *
 * Every call returns JSON validated by a Zod schema, or throws a typed LlmError; callers must
 * treat any error as "fail closed". Requests never carry a `tools` parameter: no model reachable
 * through this class can call a tool. Retries and timeouts are the SDK's (configured where the
 * Anthropic client is built). Every response's usage and estimated cost go to the audit log.
 */
export class LlmClient {
  #anthropic;
  #models;
  #auditLog;
  #logger;

  /**
   * @param {{
   *   anthropic: import('@anthropic-ai/sdk').default,
   *   models: import('./ModelConfig.js').ModelConfig,
   *   auditLog: Pick<import('../audit/AuditLog.js').AuditLog, 'record'>,
   *   logger: import('../core/Logger.js').Logger,
   * }} deps
   */
  constructor({ anthropic, models, auditLog, logger }) {
    this.#anthropic = anthropic;
    this.#models = models;
    this.#auditLog = auditLog;
    this.#logger = logger;
  }

  /**
   * @template {z.ZodType} S
   * @param {{
   *   role: import('./ModelConfig.js').LlmRole,
   *   system: string,
   *   user: string,
   *   schema: S,
   * }} request
   * @returns {Promise<z.infer<S>>}
   * @throws {LlmError | LlmRefusalError | LlmOutputError}
   */
  async complete({ role, system, user, schema }) {
    const settings = this.#models.forRole(role);
    const body = {
      model: settings.model,
      max_tokens: settings.maxTokens,
      // Fixed per role, so it is cached across calls; untrusted text only ever goes in `user`.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: {
        format: { type: 'json_schema', schema: this.#jsonSchema(schema) },
        ...(settings.effort ? { effort: settings.effort } : {}),
      },
    };

    let response;
    try {
      response = settings.fallback
        ? await this.#anthropic.beta.messages.create({
            ...body,
            betas: [FALLBACK_BETA],
            fallbacks: 'default',
          })
        : await this.#anthropic.messages.create(body);
    } catch (error) {
      this.#logger.warn('LLM call failed', { role, model: settings.model, error: error.message });
      throw new LlmError(`LLM call failed for ${role}`, { cause: error });
    }

    this.#recordUsage(role, response);
    return this.#parse(role, response, schema);
  }

  #parse(role, response, schema) {
    if (response.stop_reason === 'refusal') {
      throw new LlmRefusalError(`Model declined the ${role} request`);
    }
    if (response.stop_reason !== 'end_turn') {
      throw new LlmOutputError(`Incomplete ${role} output (stop_reason: ${response.stop_reason})`);
    }
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    let json;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new LlmOutputError(`${role} output is not JSON`, { cause: error });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      // Issue paths only: the output itself may be attacker-influenced and must not reach the log.
      const paths = parsed.error.issues.map((issue) => issue.path.join('.') || '(root)');
      throw new LlmOutputError(`${role} output failed validation at: ${paths.join(', ')}`);
    }
    return parsed.data;
  }

  #recordUsage(role, response) {
    const { usage } = response;
    this.#auditLog.record({
      actor: 'system',
      event: 'llm_call',
      subject: role,
      data: {
        model: response.model,
        stopReason: response.stop_reason,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        costUsd: this.#models.costUsd(response.model, usage),
      },
    });
  }

  /** Zod → JSON Schema accepted by structured outputs (Zod still validates the dropped constraints). */
  #jsonSchema(schema) {
    const strip = (node) => {
      if (Array.isArray(node)) return node.map(strip);
      if (node === null || typeof node !== 'object') return node;
      const copy = {};
      for (const [key, value] of Object.entries(node)) {
        if (!UNSUPPORTED_KEYWORDS.includes(key)) copy[key] = strip(value);
      }
      if (copy.type === 'object') copy.additionalProperties = false;
      return copy;
    };
    return strip(z.toJSONSchema(schema));
  }
}

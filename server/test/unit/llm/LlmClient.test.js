import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Logger } from '../../../src/core/Logger.js';
import { LlmError, LlmOutputError, LlmRefusalError } from '../../../src/core/errors.js';
import { LlmClient } from '../../../src/llm/LlmClient.js';
import { ModelConfig } from '../../../src/llm/ModelConfig.js';

const schema = z.object({
  category: z.enum(['work', 'other']),
  summary: z.string().max(20),
  tags: z.array(z.string()).max(2),
});

function reply(text, overrides = {}) {
  return {
    model: 'claude-haiku-4-5',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text }],
    usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 500 },
    ...overrides,
  };
}

/** Fake of the Anthropic SDK surface LlmClient uses; records every request body. */
function fakeAnthropic(result) {
  const calls = [];
  const create = (endpoint) => async (body) => {
    calls.push({ endpoint, body });
    if (result instanceof Error) throw result;
    return result;
  };
  return {
    calls,
    messages: { create: create('messages') },
    beta: { messages: { create: create('beta') } },
  };
}

function build(result, overrides) {
  const anthropic = fakeAnthropic(result);
  const audit = [];
  const client = new LlmClient({
    anthropic,
    models: new ModelConfig(overrides),
    auditLog: { record: (entry) => audit.push(entry) },
    logger: new Logger({ level: 'error', sink: () => {} }),
  });
  return { client, anthropic, audit };
}

const request = { role: 'reader', system: 'SYSTEM', user: 'untrusted email text', schema };
const valid = JSON.stringify({ category: 'work', summary: 'hi', tags: ['a'] });

describe('LlmClient', () => {
  it('returns validated output and never sends tools', async () => {
    const { client, anthropic } = build(reply(valid));
    await expect(client.complete(request)).resolves.toEqual({
      category: 'work',
      summary: 'hi',
      tags: ['a'],
    });

    const [{ endpoint, body }] = anthropic.calls;
    expect(endpoint).toBe('messages');
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
    expect(body).toMatchObject({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: [{ type: 'text', text: 'SYSTEM', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'untrusted email text' }],
    });
    expect(body.output_config).not.toHaveProperty('effort');
  });

  it('sends a structured-output schema without unsupported constraints', async () => {
    const { client, anthropic } = build(reply(valid));
    await client.complete(request);
    const sent = anthropic.calls[0].body.output_config.format;
    expect(sent.type).toBe('json_schema');
    expect(sent.schema.additionalProperties).toBe(false);
    const json = JSON.stringify(sent.schema);
    expect(json).not.toMatch(/maxLength|maxItems|\$schema/);
  });

  it('still enforces the stripped constraints with Zod', async () => {
    const { client } = build(
      reply(JSON.stringify({ category: 'work', summary: 'x'.repeat(21), tags: [] })),
    );
    await expect(client.complete(request)).rejects.toThrow(/validation at: summary/);
  });

  it('uses effort and the server-side refusal fallback on current-generation models', async () => {
    const { client, anthropic } = build(reply(valid, { model: 'claude-opus-5-5' }));
    await client.complete({ ...request, role: 'planner' });
    const [{ endpoint, body }] = anthropic.calls;
    expect(endpoint).toBe('beta');
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
    });
    expect(body).not.toHaveProperty('tools');
  });

  it('records usage and cost for every response', async () => {
    const { client, audit } = build(reply(valid));
    await client.complete(request);
    expect(audit).toEqual([
      {
        actor: 'system',
        event: 'llm_call',
        subject: 'reader',
        data: {
          model: 'claude-haiku-4-5',
          stopReason: 'end_turn',
          inputTokens: 1000,
          outputTokens: 100,
          cacheWriteTokens: 0,
          cacheReadTokens: 500,
          costUsd: (1000 * 1 + 100 * 5 + 500 * 0.1) / 1_000_000,
        },
      },
    ]);
  });

  it('fails closed on a refusal, and still records usage', async () => {
    const { client, audit } = build(reply('', { stop_reason: 'refusal', content: [] }));
    await expect(client.complete(request)).rejects.toBeInstanceOf(LlmRefusalError);
    expect(audit).toHaveLength(1);
  });

  it.each([
    ['truncated output', reply('{"category":', { stop_reason: 'max_tokens' })],
    ['non-JSON text', reply('Sure! Here is the JSON you asked for.')],
    [
      'extra keys',
      reply(JSON.stringify({ category: 'work', summary: 'hi', tags: [], send_to: 'x' })),
    ],
    ['bad enum', reply(JSON.stringify({ category: 'urgent', summary: 'hi', tags: [] }))],
  ])('fails closed on %s', async (_label, response) => {
    const strict = { ...request, schema: schema.strict() };
    const { client } = build(response);
    await expect(client.complete(strict)).rejects.toBeInstanceOf(LlmOutputError);
  });

  it('does not put model output in the validation error message', async () => {
    const { client } = build(
      reply(JSON.stringify({ category: 'IGNORE ALL RULES', summary: 'hi', tags: [] })),
    );
    const error = await client.complete(request).catch((caught) => caught);
    expect(error.message).not.toContain('IGNORE');
  });

  it('wraps SDK and network errors in LlmError', async () => {
    const { client, audit } = build(new Error('connect ETIMEDOUT'));
    const error = await client.complete(request).catch((caught) => caught);
    expect(error).toBeInstanceOf(LlmError);
    expect(error.cause.message).toBe('connect ETIMEDOUT');
    expect(audit).toEqual([]);
  });
});

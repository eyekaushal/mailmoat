import { describe, expect, it } from 'vitest';
import { LlmError } from '../../../src/core/errors.js';
import { AnthropicProvider } from '../../../src/llm/AnthropicProvider.js';

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';

function fakeStore() {
  const store = new Map();
  return {
    get: (name) => store.get(name) ?? null,
    set: (name, value) => store.set(name, value),
    has: (name) => store.has(name),
    delete: (name) => store.delete(name),
    masked: (name) =>
      store.has(name) ? `${store.get(name).slice(0, 7)}…${store.get(name).slice(-4)}` : null,
  };
}

function build({ envKey } = {}) {
  const created = [];
  const provider = new AnthropicProvider({
    secretStore: fakeStore(),
    envKey,
    create: (apiKey) => {
      const client = {
        apiKey,
        messages: { create: async () => 'reply' },
        beta: {},
        models: { list: async () => [] },
      };
      created.push(client);
      return client;
    },
  });
  return { provider, created };
}

describe('AnthropicProvider', () => {
  it('is unconfigured without any key and refuses to build a client', () => {
    const { provider } = build();
    expect(provider.isConfigured()).toBe(false);
    expect(provider.source()).toBeNull();
    expect(provider.masked()).toBeNull();
    expect(() => provider.messages).toThrow(LlmError);
  });

  it('prefers the key saved in Settings over .env and rebuilds the client when it changes', async () => {
    const { provider, created } = build({ envKey: 'sk-ant-env-key-00000000000000001234' });
    expect(provider.source()).toBe('env');
    expect(provider.masked()).toBe('sk-ant-…1234');
    expect(await provider.messages.create()).toBe('reply');
    provider.messages;
    expect(created).toHaveLength(1);

    provider.setKey(KEY);
    expect(provider.source()).toBe('settings');
    expect(provider.masked()).toBe('sk-ant-…6789');
    provider.messages;
    expect(created).toHaveLength(2);
    expect(created[1].apiKey).toBe(KEY);

    provider.clearKey();
    expect(provider.source()).toBe('env');
    provider.beta;
    expect(created[2].apiKey).toBe('sk-ant-env-key-00000000000000001234');
  });

  it('tests a key with one free call and reports failures without echoing details', async () => {
    const provider = new AnthropicProvider({
      secretStore: fakeStore(),
      create: (apiKey) => ({
        models: {
          list: async () => {
            if (apiKey === 'bad')
              throw Object.assign(new Error(`invalid x-api-key ${apiKey}`), { status: 401 });
            if (apiKey === 'down') throw new Error('ECONNRESET');
            return [];
          },
        },
      }),
    });
    expect(await provider.test(KEY)).toEqual({ ok: true });
    expect(await provider.test('bad')).toEqual({
      ok: false,
      reason: 'Anthropic rejected the key (401)',
    });
    expect(await provider.test('down')).toEqual({
      ok: false,
      reason: 'Could not reach the Anthropic API',
    });
    expect(await provider.test()).toEqual({ ok: false, reason: 'No API key to test' });
  });
});

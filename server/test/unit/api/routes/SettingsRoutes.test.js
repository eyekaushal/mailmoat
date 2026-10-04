import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsRoutes } from '../../../../src/api/routes/SettingsRoutes.js';
import { Database } from '../../../../src/db/Database.js';
import { Migrator } from '../../../../src/db/Migrator.js';
import { SettingsRepository } from '../../../../src/db/repositories/SettingsRepository.js';
import { AnthropicProvider } from '../../../../src/llm/AnthropicProvider.js';
import { startApi } from '../../../helpers/apiServer.js';

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';

let api;
let settings;
let audit;
let secrets;
let connected;

/** A SecretStore stand-in that keeps plaintext in memory. */
function fakeSecretStore() {
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

beforeEach(async () => {
  const db = new Database(':memory:');
  new Migrator(db).migrate();
  settings = new SettingsRepository(db);
  audit = [];
  secrets = fakeSecretStore();
  connected = false;
  const anthropic = new AnthropicProvider({
    secretStore: secrets,
    create: (apiKey) => ({
      models: {
        list: async () => {
          if (apiKey !== KEY) throw Object.assign(new Error('nope'), { status: 401 });
          return { data: [] };
        },
      },
    }),
  });
  api = await startApi({
    routes: [
      new SettingsRoutes({
        settings,
        anthropic,
        googleAuth: {
          isConnected: () => connected,
          connectedEmail: () => (connected ? 'me@gmail.com' : undefined),
        },
        googleClientConfigured: true,
        auditLog: { record: (entry) => audit.push(entry) },
      }),
    ],
  });
});

afterEach(() => api.close());

describe('GET/PUT /api/settings', () => {
  it('returns defaults plus connection state, and saves validated changes', async () => {
    const before = await api.get('/api/settings');
    expect(before.json).toEqual({
      settings: {
        plannerModel: 'claude-opus-5-5',
        drafterModel: 'claude-haiku-4-5',
        pollIntervalSeconds: 60,
        autoArchiveDangerous: false,
        trustedSenders: [],
        workingHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
        userName: '',
        draftFooter: '',
        meetingDurationMinutes: 30,
        draftRetentionDays: 7,
        wallpaper: 'tide',
      },
      anthropic: { configured: false, masked: null, source: null },
      google: { clientConfigured: true, connected: false, email: null },
    });

    connected = true;
    const after = await api.put('/api/settings', {
      pollIntervalSeconds: 120,
      trustedSenders: ['Boss@Acme.com'],
      workingHours: { days: [1, 3], start: '10:00', end: '16:00' },
    });
    expect(after.status).toBe(200);
    expect(after.json.settings).toMatchObject({
      pollIntervalSeconds: 120,
      trustedSenders: ['boss@acme.com'],
      workingHours: { days: [1, 3], start: '10:00', end: '16:00' },
      plannerModel: 'claude-opus-5-5',
    });
    expect(after.json.google).toEqual({
      clientConfigured: true,
      connected: true,
      email: 'me@gmail.com',
    });
    expect(settings.get('pollIntervalSeconds')).toBe(120);
    expect(audit).toEqual([
      {
        actor: 'user',
        event: 'settings_updated',
        data: { keys: ['pollIntervalSeconds', 'trustedSenders', 'workingHours'] },
      },
    ]);
  });

  it('rejects unknown keys, bad values and the Google account e-mail', async () => {
    expect((await api.put('/api/settings', { pollIntervalSeconds: 5 })).status).toBe(400);
    expect((await api.put('/api/settings', { plannerModel: 'gpt-5' })).status).toBe(400);
    expect((await api.put('/api/settings', { googleAccountEmail: 'x@y.z' })).status).toBe(400);
    expect(
      (await api.put('/api/settings', { workingHours: { days: [], start: '9:00', end: '18:00' } }))
        .status,
    ).toBe(400);
    expect(settings.all()).toEqual({});
  });
});

describe('Anthropic key routes', () => {
  it('stores the key write-only and only ever returns it masked', async () => {
    const saved = await api.put('/api/secrets/anthropic', { apiKey: ` ${KEY} ` });
    expect(saved.status).toBe(200);
    expect(saved.json).toEqual({ configured: true, masked: 'sk-ant-…6789', source: 'settings' });
    expect(saved.text).not.toContain(KEY);
    expect(secrets.get('anthropic_api_key')).toBe(KEY);
    expect((await api.get('/api/settings')).text).not.toContain(KEY);
    expect(audit).toEqual([{ actor: 'user', event: 'secret_updated', subject: 'anthropic' }]);

    const removed = await api.delete('/api/secrets/anthropic');
    expect(removed.json).toEqual({ configured: false, masked: null, source: null });
  });

  it('refuses keys that are not Anthropic keys', async () => {
    for (const apiKey of [
      '',
      'sk-live-abcdefghijklmnopqrstuvwxyz',
      'sk-ant-short',
      'x'.repeat(301),
    ]) {
      expect(
        (await api.put('/api/secrets/anthropic', { apiKey })).status,
        apiKey.slice(0, 12),
      ).toBe(400);
    }
    expect(secrets.has('anthropic_api_key')).toBe(false);
  });

  it('tests a pasted key or the stored one with a minimal API call', async () => {
    expect((await api.post('/api/secrets/anthropic/test')).json).toEqual({
      ok: false,
      reason: 'No API key to test',
    });
    expect((await api.post('/api/secrets/anthropic/test', { apiKey: KEY })).json).toEqual({
      ok: true,
    });
    expect(
      (
        await api.post('/api/secrets/anthropic/test', {
          apiKey: 'sk-ant-api03-wrongwrongwrongwrongwrong',
        })
      ).json,
    ).toEqual({
      ok: false,
      reason: 'Anthropic rejected the key (401)',
    });
    await api.put('/api/secrets/anthropic', { apiKey: KEY });
    expect((await api.post('/api/secrets/anthropic/test')).json).toEqual({ ok: true });
  });
});

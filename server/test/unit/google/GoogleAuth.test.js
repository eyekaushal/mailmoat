import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { KeyProvider } from '../../../src/config/KeyProvider.js';
import { SecretStore } from '../../../src/config/SecretStore.js';
import { GoogleAuthError, NotConnectedError } from '../../../src/core/errors.js';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { SettingsRepository } from '../../../src/db/repositories/SettingsRepository.js';
import { GOOGLE_SCOPES, GoogleAuth } from '../../../src/google/GoogleAuth.js';

const ALL_SCOPES = GOOGLE_SCOPES.filter((s) => s.startsWith('https://')).join(' ');

/** Stands in for google-auth-library's OAuth2Client and records what it was asked. */
class FakeOAuthClient {
  static tokens = {};
  static revoked = [];
  static lastAuthUrlOptions;

  constructor(options) {
    this.options = options;
    this.listeners = {};
  }
  async generateCodeVerifierAsync() {
    return { codeVerifier: 'verifier-123', codeChallenge: 'challenge-abc' };
  }
  generateAuthUrl(options) {
    FakeOAuthClient.lastAuthUrlOptions = options;
    return `https://accounts.google.com/o/oauth2/v2/auth?state=${options.state}`;
  }
  async getToken({ code, codeVerifier }) {
    this.exchanged = { code, codeVerifier };
    FakeOAuthClient.lastExchange = this.exchanged;
    return { tokens: FakeOAuthClient.tokens };
  }
  async verifyIdToken({ audience }) {
    if (audience !== 'client-id') throw new Error('wrong audience');
    return { getPayload: () => ({ email: 'test.user@gmail.com' }) };
  }
  setCredentials(credentials) {
    this.credentials = credentials;
  }
  on(event, listener) {
    this.listeners[event] = listener;
  }
  async revokeToken(token) {
    FakeOAuthClient.revoked.push(token);
  }
}

let secretStore;
let settings;
let clock;
let auth;

beforeEach(() => {
  const db = new Database(':memory:');
  new Migrator(db).migrate();
  secretStore = new SecretStore(
    db,
    new KeyProvider(join(mkdtempSync(join(tmpdir(), 'mailmoat-g-')), 'master.key')),
  );
  settings = new SettingsRepository(db);
  clock = 1_000_000;
  FakeOAuthClient.tokens = {
    refresh_token: 'refresh-xyz',
    id_token: 'id-token',
    scope: `openid ${ALL_SCOPES}`,
  };
  FakeOAuthClient.revoked = [];
  auth = new GoogleAuth({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://127.0.0.1:4747/api/google/callback',
    secretStore,
    settings,
    createOAuthClient: (options) => new FakeOAuthClient(options),
    now: () => clock,
  });
});

const stateFrom = (url) => new URL(url).searchParams.get('state');

describe('GoogleAuth', () => {
  it('builds a consent URL with PKCE (S256), offline access, minimal scopes and a random state', async () => {
    const url = await auth.createAuthUrl();
    const options = FakeOAuthClient.lastAuthUrlOptions;
    expect(options).toMatchObject({
      access_type: 'offline',
      prompt: 'consent',
      code_challenge_method: 'S256',
      code_challenge: 'challenge-abc',
    });
    expect(options.scope).not.toContain('https://www.googleapis.com/auth/gmail.settings.basic');
    expect(options.scope).not.toContain('https://mail.google.com/');
    expect(stateFrom(url)).toHaveLength(43);
    expect(stateFrom(await auth.createAuthUrl())).not.toBe(stateFrom(url));
  });

  it('exchanges the code with the PKCE verifier and stores the refresh token encrypted', async () => {
    const state = stateFrom(await auth.createAuthUrl());
    await expect(auth.handleCallback({ code: 'code-1', state })).resolves.toEqual({
      email: 'test.user@gmail.com',
    });
    expect(FakeOAuthClient.lastExchange).toEqual({ code: 'code-1', codeVerifier: 'verifier-123' });
    expect(secretStore.get('google_refresh_token')).toBe('refresh-xyz');
    expect(auth.isConnected()).toBe(true);
    expect(auth.connectedEmail()).toBe('test.user@gmail.com');
  });

  it('rejects an unknown state (CSRF on the callback)', async () => {
    await auth.createAuthUrl();
    await expect(auth.handleCallback({ code: 'c', state: 'forged' })).rejects.toThrow(
      GoogleAuthError,
    );
    expect(auth.isConnected()).toBe(false);
  });

  it('accepts each state only once', async () => {
    const state = stateFrom(await auth.createAuthUrl());
    await auth.handleCallback({ code: 'c', state });
    await expect(auth.handleCallback({ code: 'c', state })).rejects.toThrow(/expired or invalid/);
  });

  it('expires sign-in links after 10 minutes', async () => {
    const state = stateFrom(await auth.createAuthUrl());
    clock += 10 * 60 * 1000 + 1;
    await expect(auth.handleCallback({ code: 'c', state })).rejects.toThrow(/expired or invalid/);
  });

  it('refuses a partial grant when the user unticks a permission', async () => {
    FakeOAuthClient.tokens.scope = 'openid https://www.googleapis.com/auth/gmail.modify';
    const state = stateFrom(await auth.createAuthUrl());
    await expect(auth.handleCallback({ code: 'c', state })).rejects.toThrow(/calendar\.events/);
    expect(auth.isConnected()).toBe(false);
  });

  it('refuses a grant without a refresh token', async () => {
    delete FakeOAuthClient.tokens.refresh_token;
    const state = stateFrom(await auth.createAuthUrl());
    await expect(auth.handleCallback({ code: 'c', state })).rejects.toThrow(/refresh token/);
  });

  it('reports a cancelled consent screen clearly', async () => {
    await expect(auth.handleCallback({ error: 'access_denied' })).rejects.toThrow(/access_denied/);
  });

  it('gives an authorized client and keeps a rotated refresh token', async () => {
    expect(() => auth.getAuthClient()).toThrow(NotConnectedError);
    const state = stateFrom(await auth.createAuthUrl());
    await auth.handleCallback({ code: 'c', state });
    const client = auth.getAuthClient();
    expect(client.credentials).toEqual({ refresh_token: 'refresh-xyz' });
    client.listeners.tokens({ refresh_token: 'refresh-new', access_token: 'a' });
    expect(secretStore.get('google_refresh_token')).toBe('refresh-new');
  });

  it('disconnects by revoking at Google and deleting the local token', async () => {
    const state = stateFrom(await auth.createAuthUrl());
    await auth.handleCallback({ code: 'c', state });
    await expect(auth.disconnect()).resolves.toEqual({ revoked: true });
    expect(FakeOAuthClient.revoked).toEqual(['refresh-xyz']);
    expect(auth.isConnected()).toBe(false);
  });
});

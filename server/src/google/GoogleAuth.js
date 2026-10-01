import { randomBytes, timingSafeEqual } from 'node:crypto';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { GoogleAuthError, NotConnectedError } from '../core/errors.js';

/** Minimal scopes (SECURITY_APPROACH §9, P11). Block is app-side, so no Gmail settings scope. */
export const GOOGLE_SCOPES = Object.freeze([
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
]);

const REQUIRED_SCOPES = GOOGLE_SCOPES.filter((scope) => scope.startsWith('https://'));
const REFRESH_TOKEN_SECRET = 'google_refresh_token';
const ACCOUNT_EMAIL_SETTING = 'googleAccountEmail';
const PENDING_TTL_MS = 10 * 60 * 1000;

/**
 * Google sign-in for a local app: OAuth with a loopback redirect, PKCE and a one-time `state`.
 * Only the refresh token is kept, encrypted in the SecretStore.
 */
export class GoogleAuth {
  #clientOptions;
  #secretStore;
  #settings;
  #createOAuthClient;
  #now;
  /** @type {Map<string, { codeVerifier: string, expiresAt: number }>} */
  #pending = new Map();
  #authClient;

  /**
   * @param {object} deps
   * @param {string} deps.clientId
   * @param {string} deps.clientSecret
   * @param {string} deps.redirectUri e.g. http://127.0.0.1:4747/api/google/callback
   * @param {import('../config/SecretStore.js').SecretStore} deps.secretStore
   * @param {import('../db/repositories/SettingsRepository.js').SettingsRepository} deps.settings
   * @param {(options: object) => OAuth2Client} [deps.createOAuthClient] injectable for tests
   * @param {() => number} [deps.now]
   */
  constructor({
    clientId,
    clientSecret,
    redirectUri,
    secretStore,
    settings,
    createOAuthClient = (options) => new OAuth2Client(options),
    now = () => Date.now(),
  }) {
    this.#clientOptions = { clientId, clientSecret, redirectUri };
    this.#secretStore = secretStore;
    this.#settings = settings;
    this.#createOAuthClient = createOAuthClient;
    this.#now = now;
  }

  /** @returns {Promise<string>} the Google consent URL to open in the browser */
  async createAuthUrl() {
    this.#dropExpired();
    const client = this.#createOAuthClient(this.#clientOptions);
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const state = randomBytes(32).toString('base64url');
    this.#pending.set(state, { codeVerifier, expiresAt: this.#now() + PENDING_TTL_MS });
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // forces Google to return a refresh token
      scope: [...GOOGLE_SCOPES],
      state,
      code_challenge_method: CodeChallengeMethod.S256,
      code_challenge: codeChallenge,
    });
  }

  /**
   * Completes sign-in from the redirect's query parameters.
   * @param {{ code?: string, state?: string, error?: string }} params
   * @returns {Promise<{ email: string }>}
   */
  async handleCallback({ code, state, error }) {
    if (error) throw new GoogleAuthError(`Google sign-in was not completed: ${error}`);
    const pending = this.#takePending(state);
    if (!code) throw new GoogleAuthError('Google did not return an authorization code');

    const client = this.#createOAuthClient(this.#clientOptions);
    const { tokens } = await client.getToken({ code, codeVerifier: pending.codeVerifier });

    const granted = new Set((tokens.scope ?? '').split(/\s+/));
    const missing = REQUIRED_SCOPES.filter((scope) => !granted.has(scope));
    if (missing.length > 0) {
      throw new GoogleAuthError(
        `Please allow every requested permission. Missing: ${missing.join(', ')}`,
      );
    }
    if (!tokens.refresh_token) {
      throw new GoogleAuthError(
        'Google did not return a refresh token; please try connecting again',
      );
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.#clientOptions.clientId,
    });
    const email = ticket.getPayload()?.email;
    if (!email) throw new GoogleAuthError('Could not read the Google account email');

    this.#secretStore.set(REFRESH_TOKEN_SECRET, tokens.refresh_token);
    this.#settings.set(ACCOUNT_EMAIL_SETTING, email);
    this.#authClient = undefined;
    return { email };
  }

  isConnected() {
    return this.#secretStore.has(REFRESH_TOKEN_SECRET);
  }

  /** @returns {string | undefined} */
  connectedEmail() {
    return this.#settings.get(ACCOUNT_EMAIL_SETTING);
  }

  /** @returns {OAuth2Client} an authorized client that refreshes access tokens itself */
  getAuthClient() {
    if (this.#authClient) return this.#authClient;
    const refreshToken = this.#secretStore.get(REFRESH_TOKEN_SECRET);
    if (!refreshToken) throw new NotConnectedError('No Google account is connected');

    const client = this.#createOAuthClient(this.#clientOptions);
    client.setCredentials({ refresh_token: refreshToken });
    // Google may rotate the refresh token; keep the newest one.
    client.on('tokens', (tokens) => {
      if (tokens.refresh_token) this.#secretStore.set(REFRESH_TOKEN_SECRET, tokens.refresh_token);
    });
    this.#authClient = client;
    return client;
  }

  /** Revokes access at Google (best effort) and forgets the token locally. */
  async disconnect() {
    const refreshToken = this.#secretStore.get(REFRESH_TOKEN_SECRET);
    this.#secretStore.delete(REFRESH_TOKEN_SECRET);
    this.#authClient = undefined;
    if (!refreshToken) return { revoked: false };
    try {
      await this.#createOAuthClient(this.#clientOptions).revokeToken(refreshToken);
      return { revoked: true };
    } catch {
      // The local token is already gone; the user can also revoke at myaccount.google.com.
      return { revoked: false };
    }
  }

  #takePending(state) {
    this.#dropExpired();
    const match = [...this.#pending.keys()].find((known) => this.#sameState(known, state));
    if (!match) throw new GoogleAuthError('Sign-in link expired or invalid; please start again');
    const pending = this.#pending.get(match);
    this.#pending.delete(match); // one-time use
    return pending;
  }

  #sameState(known, received) {
    if (typeof received !== 'string') return false;
    const a = Buffer.from(known);
    const b = Buffer.from(received);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  #dropExpired() {
    const now = this.#now();
    for (const [state, entry] of this.#pending) {
      if (entry.expiresAt <= now) this.#pending.delete(state);
    }
  }
}

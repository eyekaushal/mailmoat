import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GoogleRoutes } from '../../../../src/api/routes/GoogleRoutes.js';
import { Logger } from '../../../../src/core/Logger.js';
import { GoogleAuthError } from '../../../../src/core/errors.js';
import { startApi } from '../../../helpers/apiServer.js';

let api;
let audit;
let events;
let auth;

function start(clientConfigured = true) {
  return startApi({
    routes: [
      new GoogleRoutes({
        googleAuth: auth,
        clientConfigured,
        onConnected: async () => events.push('connected'),
        onDisconnected: async () => events.push('disconnected'),
        auditLog: { record: (entry) => audit.push(entry) },
        logger: new Logger({ level: 'error', sink: () => {} }),
      }),
    ],
  });
}

beforeEach(() => {
  audit = [];
  events = [];
  auth = {
    calls: [],
    createAuthUrl: async () => 'https://accounts.google.com/o/oauth2/v2/auth?state=s1',
    handleCallback: async (params) => {
      auth.calls.push(params);
      if (params.error) throw new GoogleAuthError(`Google refused: ${params.error}`);
      if (params.state !== 's1') throw new GoogleAuthError('Sign-in link expired or invalid');
      return { email: 'me@gmail.com' };
    },
    disconnect: async () => ({ revoked: true }),
    connectedEmail: () => 'me@gmail.com',
  };
});

afterEach(() => api?.close());

describe('GoogleRoutes', () => {
  it('starts Connect Google with the built-in client: the user never supplies one', async () => {
    api = await start();
    const res = await api.get('/api/google/auth-url');
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=s1' });
  });

  it('explains when no client is configured at all', async () => {
    api = await start(false);
    const res = await api.get('/api/google/auth-url');
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/no Google OAuth client/);
  });

  it('completes the loopback callback, starts sync and lands the browser in the UI', async () => {
    api = await start();
    const res = await api.get('/api/google/callback?code=c1&state=s1');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/?google=connected');
    expect(auth.calls).toEqual([{ code: 'c1', state: 's1', error: undefined }]);
    expect(events).toEqual(['connected']);
    expect(audit).toEqual([{ actor: 'user', event: 'google_connected' }]);
  });

  it('sends sign-in failures back to the UI as a query string, never a stack trace', async () => {
    api = await start();
    const denied = await api.get('/api/google/callback?error=access_denied');
    expect(denied.status).toBe(302);
    expect(denied.headers.location).toBe(
      '/?google=error&reason=Google%20refused%3A%20access_denied',
    );
    const stale = await api.get('/api/google/callback?code=c1&state=old');
    expect(stale.headers.location).toMatch(/^\/\?google=error&reason=Sign-in%20link/);
    expect(events).toEqual([]);
    expect(audit.map((e) => e.event)).toEqual(['google_connect_failed', 'google_connect_failed']);
  });

  it('disconnects, stops sync and records it', async () => {
    api = await start();
    const res = await api.post('/api/google/disconnect');
    expect(res.json).toEqual({ connected: false, revoked: true });
    expect(events).toEqual(['disconnected']);
    expect(audit).toEqual([
      { actor: 'user', event: 'google_disconnected', data: { revoked: true } },
    ]);
  });
});

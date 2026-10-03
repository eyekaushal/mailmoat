import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { SecurityMiddleware } from '../../../src/api/SecurityMiddleware.js';
import { freePort, rawRequest } from '../../helpers/apiServer.js';

let port;
let server;

beforeEach(async () => {
  port = await freePort();
  const app = express();
  app.use(new SecurityMiddleware({ port }).handler());
  app.use(express.json());
  app.get('/api/csrf', (_req, res) => res.json({ token: res.locals.csrfToken }));
  app.get('/api/ping', (_req, res) => res.json({ ok: true }));
  app.post('/api/change', (req, res) => res.json({ changed: req.body }));
  app.get('/', (_req, res) => res.send('ui'));
  await new Promise((resolve) => {
    server = app.listen(port, '127.0.0.1', resolve);
  });
});

afterEach(() => new Promise((resolve) => server.close(resolve)));

const ownHost = () => `127.0.0.1:${port}`;

/** Does a GET as the UI would, returning the session cookie and CSRF token. */
async function session() {
  const first = await rawRequest({ port, path: '/api/csrf', headers: { host: ownHost() } });
  const cookie = first.headers['set-cookie'][0].split(';')[0];
  return { cookie, token: first.json.token, setCookie: first.headers['set-cookie'][0] };
}

describe('SecurityMiddleware — DNS rebinding (Host header)', () => {
  it('refuses any Host that is not this app, before routes run', async () => {
    for (const host of ['evil.com', `evil.com:${port}`, '127.0.0.1:9', `localhost:${port + 1}`]) {
      const res = await rawRequest({ port, path: '/api/ping', headers: { host } });
      expect(res.status, `host=${host}`).toBe(403);
      expect(res.json.error).toMatch(/Host/);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('accepts 127.0.0.1 and localhost with the right port', async () => {
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`]) {
      const res = await rawRequest({ port, path: '/api/ping', headers: { host } });
      expect(res.status, host).toBe(200);
    }
  });
});

describe('SecurityMiddleware — Origin and CSRF', () => {
  it('refuses a cross-origin request even when it is a GET', async () => {
    const res = await rawRequest({
      port,
      path: '/api/ping',
      headers: { host: ownHost(), origin: 'https://evil.com' },
    });
    expect(res.status).toBe(403);
    expect(res.json.error).toMatch(/cross-origin/);
  });

  it('refuses a state-changing request without the session token', async () => {
    const { cookie } = await session();
    const noToken = await rawRequest({
      port,
      method: 'POST',
      path: '/api/change',
      headers: { host: ownHost(), origin: `http://${ownHost()}`, cookie },
    });
    expect(noToken.status).toBe(403);
    expect(noToken.json.error).toMatch(/CSRF/);

    const wrongToken = await rawRequest({
      port,
      method: 'POST',
      path: '/api/change',
      headers: { host: ownHost(), cookie, 'x-csrf-token': 'a'.repeat(43) },
    });
    expect(wrongToken.status).toBe(403);
  });

  it('refuses a token that belongs to another session (no cookie, or a forged one)', async () => {
    const { token } = await session();
    const noCookie = await rawRequest({
      port,
      method: 'POST',
      path: '/api/change',
      headers: { host: ownHost(), 'x-csrf-token': token },
    });
    expect(noCookie.status).toBe(403);
    const forged = await rawRequest({
      port,
      method: 'POST',
      path: '/api/change',
      headers: { host: ownHost(), cookie: 'mailmoat_session=forged', 'x-csrf-token': token },
    });
    expect(forged.status).toBe(403);
  });

  it('accepts the UI: own origin, session cookie and matching token', async () => {
    const { cookie, token } = await session();
    const res = await rawRequest({
      port,
      method: 'POST',
      path: '/api/change',
      headers: {
        host: ownHost(),
        origin: `http://${ownHost()}`,
        cookie,
        'x-csrf-token': token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ a: 1 }),
    });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ changed: { a: 1 } });
  });

  it('issues an HttpOnly, SameSite=Strict session cookie once and then reuses it', async () => {
    const { cookie, setCookie } = await session();
    expect(setCookie).toMatch(
      /^mailmoat_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict$/,
    );
    const again = await rawRequest({
      port,
      path: '/api/csrf',
      headers: { host: ownHost(), cookie },
    });
    expect(again.headers['set-cookie']).toBeUndefined();
  });

  it('gives each session its own token', async () => {
    const a = await session();
    const b = await session();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('SecurityMiddleware — response headers', () => {
  it('sets a strict CSP with no remote content and no framing, plus no-store for the API', async () => {
    const api = await rawRequest({ port, path: '/api/ping', headers: { host: ownHost() } });
    const csp = api.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('https:');
    expect(api.headers['x-content-type-options']).toBe('nosniff');
    expect(api.headers['referrer-policy']).toBe('no-referrer');
    expect(api.headers['x-frame-options']).toBe('DENY');
    expect(api.headers['cache-control']).toBe('no-store');

    const ui = await rawRequest({ port, path: '/', headers: { host: ownHost() } });
    expect(ui.headers['content-security-policy']).toBe(csp);
    expect(ui.headers['cache-control']).toBeUndefined();
  });
});

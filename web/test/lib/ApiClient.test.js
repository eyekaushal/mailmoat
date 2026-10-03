import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../../src/lib/ApiClient.js';

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? {} : { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** A fake server: `/csrf` hands out tokens; every other route echoes what it received. */
function fakeServer({ tokens = ['tok-1'], reject403Until = 0 } = {}) {
  const calls = [];
  let csrfCalls = 0;
  let rejected = 0;
  const fetch = vi.fn(async (url, init) => {
    calls.push({ url, init });
    if (url === '/api/csrf')
      return jsonResponse({ token: tokens[Math.min(csrfCalls++, tokens.length - 1)] });
    if (init.method !== 'GET' && rejected < reject403Until) {
      rejected++;
      return jsonResponse(
        { error: 'Request refused: missing or invalid CSRF token' },
        { status: 403 },
      );
    }
    if (url === '/api/boom') return jsonResponse({ error: 'Unknown approval' }, { status: 404 });
    if (url === '/api/empty') return jsonResponse(null, { status: 204 });
    if (url === '/api/text') return new Response('plain failure', { status: 500 });
    return jsonResponse({ ok: true, method: init.method, body: init.body ?? null });
  });
  return { fetch, calls };
}

describe('ApiClient', () => {
  it('GET sends no CSRF token and includes the session cookie', async () => {
    const server = fakeServer();
    const client = new ApiClient({ fetch: server.fetch });
    const data = await client.get('/health');
    expect(data).toEqual({ ok: true, method: 'GET', body: null });
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].init.credentials).toBe('same-origin');
    expect(server.calls[0].init.headers['X-CSRF-Token']).toBeUndefined();
  });

  it('fetches the CSRF token once and sends it on every non-GET', async () => {
    const server = fakeServer();
    const client = new ApiClient({ fetch: server.fetch });
    await client.post('/chats', { title: 'x' });
    await client.patch('/rules/r1', { enabled: false });
    await client.put('/settings', {});
    await client.delete('/chats/1');
    const csrf = server.calls.filter((call) => call.url === '/api/csrf');
    expect(csrf).toHaveLength(1);
    const writes = server.calls.filter((call) => call.init.method !== 'GET');
    expect(writes).toHaveLength(4);
    for (const call of writes) expect(call.init.headers['X-CSRF-Token']).toBe('tok-1');
    expect(writes[0].init.headers['Content-Type']).toBe('application/json');
    expect(writes[0].init.body).toBe('{"title":"x"}');
    expect(writes[3].init.body).toBeUndefined();
  });

  it('refreshes the token and retries once after a CSRF 403 (server restarted)', async () => {
    const server = fakeServer({ tokens: ['stale', 'fresh'], reject403Until: 1 });
    const client = new ApiClient({ fetch: server.fetch });
    const data = await client.post('/approvals/1/approve');
    expect(data.ok).toBe(true);
    const writes = server.calls.filter((call) => call.init.method === 'POST');
    expect(writes.map((call) => call.init.headers['X-CSRF-Token'])).toEqual(['stale', 'fresh']);
  });

  it('gives up after one retry when the token is still refused', async () => {
    const server = fakeServer({ reject403Until: 5 });
    const client = new ApiClient({ fetch: server.fetch });
    await expect(client.post('/x')).rejects.toMatchObject({ name: 'ApiError', status: 403 });
    expect(server.calls.filter((call) => call.init.method === 'POST')).toHaveLength(2);
  });

  it("throws ApiError with the server's message and status", async () => {
    const client = new ApiClient({ fetch: fakeServer().fetch });
    const error = await client.get('/boom').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('Unknown approval');
    expect(error.status).toBe(404);
    expect(error.path).toBe('/boom');
  });

  it('handles empty and non-JSON responses', async () => {
    const client = new ApiClient({ fetch: fakeServer().fetch });
    expect(await client.get('/empty')).toBeNull();
    await expect(client.get('/text')).rejects.toMatchObject({
      message: 'plain failure',
      status: 500,
    });
  });
});

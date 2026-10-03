import { createServer, request as httpRequest } from 'node:http';
import { App } from '../../src/api/App.js';
import { SecurityMiddleware } from '../../src/api/SecurityMiddleware.js';
import { Logger } from '../../src/core/Logger.js';

/** A port nobody is listening on right now. */
export function freePort() {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * A raw HTTP request with full control over headers (fetch refuses to set `Host`).
 * @returns {Promise<{ status: number, headers: Record<string, string | string[]>, text: string, json: unknown }>}
 */
export function rawRequest({ port, method = 'GET', path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, method, path, headers, setHost: false },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            json = undefined;
          }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/**
 * Starts the real App (security middleware included) with the given routes on a free port and
 * returns a client that behaves like the web UI: same-origin, session cookie, CSRF header.
 * @param {{ routes: { router(): import('express').Router }[], staticDir?: string, logger?: Logger }} options
 */
export async function startApi({ routes, staticDir, logger }) {
  const port = await freePort();
  const log = logger ?? new Logger({ level: 'error', sink: () => {} });
  const app = new App({
    security: new SecurityMiddleware({ port }),
    routes,
    host: '127.0.0.1',
    port,
    staticDir,
    logger: log,
  });
  const server = await app.listen();
  const origin = `http://127.0.0.1:${port}`;
  let cookie = '';
  let token = '';
  // Node's fetch follows the browser rule that drops `Cookie`/`Host`, so requests go over node:http.

  const send = async (method, path, body, extraHeaders = {}, rawBody) => {
    if (!token && method !== 'GET') await send('GET', '/api/csrf');
    const headers = { host: `127.0.0.1:${port}`, origin, ...extraHeaders };
    if (cookie) headers.cookie = cookie;
    if (method !== 'GET') headers['x-csrf-token'] = token;
    const payload = rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
    if (payload !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(payload);
    }
    const response = await rawRequest({ port, method, path, headers, body: payload });
    const setCookie = response.headers['set-cookie']?.[0];
    if (setCookie) cookie = setCookie.split(';')[0];
    if (path === '/api/csrf' && response.json?.token) token = response.json.token;
    return response;
  };

  return {
    port,
    origin,
    get: (path, headers) => send('GET', path, undefined, headers),
    post: (path, body, headers, rawBody) => send('POST', path, body, headers, rawBody),
    /** A request with no session at all: what another website's script would manage. */
    raw: (options) => rawRequest({ port, headers: { host: `127.0.0.1:${port}` }, ...options }),
    put: (path, body) => send('PUT', path, body),
    patch: (path, body) => send('PATCH', path, body),
    delete: (path) => send('DELETE', path),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

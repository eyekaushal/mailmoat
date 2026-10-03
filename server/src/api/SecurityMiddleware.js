import { randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'mailmoat_session';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAX_SESSIONS = 1000;

/**
 * Browser-facing protection for the loopback API (SECURITY_APPROACH §9).
 *
 * - DNS rebinding: the `Host` header must name this app (`127.0.0.1:<port>` / `localhost:<port>`),
 *   so a page at evil.com re-pointed to 127.0.0.1 is refused before any route runs.
 * - CSRF, three layers: `Origin`, when present, must be the app's own; the session cookie is
 *   `HttpOnly; SameSite=Strict` so other sites never send it; and every state-changing request
 *   must carry the session's CSRF token in a header, which only same-origin script can read.
 * - Headers: a strict CSP (no remote content, no inline script, no framing), no sniffing, no
 *   referrer, no caching of API responses.
 *
 * Sessions live in memory: a restart simply issues new ones.
 */
export class SecurityMiddleware {
  #allowedHosts;
  #allowedOrigins;
  /** @type {Map<string, string>} session id → CSRF token */
  #sessions = new Map();
  #random;

  /**
   * @param {{ port: number, random?: (bytes: number) => Buffer }} options `random` is injectable for tests
   */
  constructor({ port, random = randomBytes }) {
    this.#allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    this.#allowedOrigins = new Set([...this.#allowedHosts].map((host) => `http://${host}`));
    this.#random = random;
  }

  /** @returns {import('express').RequestHandler} */
  handler() {
    return (request, response, next) => {
      SecurityMiddleware.#setHeaders(request, response);
      if (!this.#allowedHosts.has(request.headers.host ?? '')) {
        return SecurityMiddleware.#refuse(response, 'Request refused: unexpected Host header');
      }
      const origin = request.headers.origin;
      if (origin !== undefined && !this.#allowedOrigins.has(origin)) {
        return SecurityMiddleware.#refuse(response, 'Request refused: cross-origin request');
      }
      const session = this.#session(request, response);
      response.locals.csrfToken = session.token;
      if (SAFE_METHODS.has(request.method)) return next();

      const presented = request.headers[CSRF_HEADER];
      if (session.isNew || !SecurityMiddleware.#sameToken(presented, session.token)) {
        return SecurityMiddleware.#refuse(
          response,
          'Request refused: missing or invalid CSRF token',
        );
      }
      next();
    };
  }

  /** Finds the caller's session from the cookie, or starts one. */
  #session(request, response) {
    const id = SecurityMiddleware.#cookie(request.headers.cookie, SESSION_COOKIE);
    if (id && this.#sessions.has(id)) return { token: this.#sessions.get(id), isNew: false };

    if (this.#sessions.size >= MAX_SESSIONS) {
      this.#sessions.delete(this.#sessions.keys().next().value);
    }
    const newId = this.#random(32).toString('base64url');
    const token = this.#random(32).toString('base64url');
    this.#sessions.set(newId, token);
    response.append('Set-Cookie', `${SESSION_COOKIE}=${newId}; Path=/; HttpOnly; SameSite=Strict`);
    return { token, isNew: true };
  }

  static #setHeaders(request, response) {
    response.set({
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-src 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
      ].join('; '),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (request.path.startsWith('/api/')) response.set('Cache-Control', 'no-store');
  }

  static #refuse(response, message) {
    response.status(403).json({ error: message });
  }

  static #sameToken(presented, expected) {
    if (typeof presented !== 'string' || presented.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
  }

  static #cookie(header, name) {
    if (!header) return undefined;
    for (const part of header.split(';')) {
      const [key, ...rest] = part.trim().split('=');
      if (key === name) return rest.join('=');
    }
    return undefined;
  }
}

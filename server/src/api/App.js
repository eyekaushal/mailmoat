import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import {
  ApprovalError,
  ChatError,
  ConfigError,
  DraftError,
  GoogleAuthError,
  HttpError,
  LlmError,
  MailmoatError,
  MeetingError,
  NotConnectedError,
  NotFoundError,
  RuleError,
  UnsubscribeError,
  ValidationError,
} from '../core/errors.js';

const BODY_LIMIT = '2mb';

/** HTTP status per typed error; anything else is a 500 whose details stay in the server log. */
const STATUS_BY_ERROR = [
  [ValidationError, 400],
  [NotFoundError, 404],
  [GoogleAuthError, 400],
  [NotConnectedError, 409],
  [ApprovalError, 409],
  [ChatError, 400],
  [RuleError, 400],
  [DraftError, 400],
  [MeetingError, 400],
  [UnsubscribeError, 400],
  [ConfigError, 409],
  [HttpError, 502],
  [LlmError, 502],
  [MailmoatError, 400],
];

/**
 * The Express application: security middleware first, the CSRF token endpoint, the JSON API
 * under `/api`, and the built web UI (when present) as static files with an SPA fallback.
 * Listens on loopback only.
 */
export class App {
  #security;
  #routes;
  #staticDir;
  #logger;
  #host;
  #port;

  /**
   * @param {{
   *   security: import('./SecurityMiddleware.js').SecurityMiddleware,
   *   routes: { router(): import('express').Router }[],
   *   host: string,
   *   port: number,
   *   staticDir?: string the built web UI (`web/dist`)
   *   logger: import('../core/Logger.js').Logger,
   * }} deps
   */
  constructor({ security, routes, host, port, staticDir, logger }) {
    this.#security = security;
    this.#routes = routes;
    this.#host = host;
    this.#port = port;
    this.#staticDir = staticDir;
    this.#logger = logger;
  }

  /** @returns {import('express').Express} */
  build() {
    const app = express();
    app.disable('x-powered-by');
    app.set('etag', false);
    app.use(this.#security.handler());

    const api = express.Router();
    api.use(express.json({ limit: BODY_LIMIT }));
    // The UI reads its session's CSRF token here and sends it back on every non-GET request.
    api.get('/csrf', (_request, response) => response.json({ token: response.locals.csrfToken }));
    for (const route of this.#routes) api.use(route.router());
    api.use((_request, _response, next) => next(new NotFoundError('No such API route')));
    app.use('/api', api);

    if (this.#staticDir && existsSync(this.#staticDir)) {
      app.use(express.static(this.#staticDir, { index: 'index.html' }));
      app.get('/{*path}', (_request, response) =>
        response.sendFile(join(this.#staticDir, 'index.html')),
      );
    } else {
      app.get('/', (_request, response) =>
        response.type('text/plain').send('mailmoat API is running; the web UI is not built.'),
      );
    }

    app.use((error, request, response, _next) => this.#onError(error, request, response));
    return app;
  }

  /** @returns {Promise<import('node:http').Server>} bound to the loopback address only */
  listen() {
    return new Promise((resolve, reject) => {
      const server = this.build().listen(this.#port, this.#host, () => resolve(server));
      server.once('error', reject);
    });
  }

  #onError(error, request, response) {
    const status =
      error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large'
        ? 400
        : (STATUS_BY_ERROR.find(([type]) => error instanceof type)?.[1] ?? 500);
    const message = status === 500 ? 'Internal error' : error.message;
    this.#logger[status === 500 ? 'error' : 'warn']('request failed', {
      method: request.method,
      path: request.path,
      status,
      error: error?.name ?? 'Error',
      ...(status === 500 ? { message: error?.message } : {}),
    });
    if (response.headersSent) return response.end();
    response.status(status).json({ error: message });
  }
}

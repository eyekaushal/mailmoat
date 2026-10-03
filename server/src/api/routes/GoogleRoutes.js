import { Router } from 'express';
import { GoogleAuthError } from '../../core/errors.js';

/**
 * Connect Google (PRD F1.4, F1.5): the auth URL uses mailmoat's built-in OAuth client, Google
 * redirects the browser back to `/api/google/callback`, and the user lands in the UI with
 * `?google=connected` (or `?google=error&reason=…`). Sync starts as soon as the account is linked.
 */
export class GoogleRoutes {
  #deps;

  /**
   * @param {{
   *   googleAuth: Pick<import('../../google/GoogleAuth.js').GoogleAuth, 'createAuthUrl'|'handleCallback'|'disconnect'|'connectedEmail'>,
   *   clientConfigured: boolean,
   *   onConnected: () => Promise<void>,
   *   onDisconnected: () => Promise<void>,
   *   auditLog: Pick<import('../../audit/AuditLog.js').AuditLog, 'record'>,
   *   logger: import('../../core/Logger.js').Logger,
   * }} deps
   */
  constructor(deps) {
    this.#deps = deps;
  }

  router() {
    const { googleAuth, clientConfigured, onConnected, onDisconnected, auditLog, logger } =
      this.#deps;
    const router = Router();
    router.get('/google/auth-url', async (_request, response) => {
      if (!clientConfigured) {
        throw new GoogleAuthError('mailmoat has no Google OAuth client configured');
      }
      response.json({ url: await googleAuth.createAuthUrl() });
    });
    router.get('/google/callback', async (request, response) => {
      const { code, state, error } = request.query;
      try {
        await googleAuth.handleCallback({ code, state, error });
      } catch (caught) {
        if (!(caught instanceof GoogleAuthError)) throw caught;
        logger.warn('Google sign-in failed', { error: caught.name });
        auditLog.record({ actor: 'user', event: 'google_connect_failed', reason: caught.message });
        return response.redirect(`/?google=error&reason=${encodeURIComponent(caught.message)}`);
      }
      auditLog.record({ actor: 'user', event: 'google_connected' });
      await onConnected();
      response.redirect('/?google=connected');
    });
    router.post('/google/disconnect', async (_request, response) => {
      const { revoked } = await googleAuth.disconnect();
      await onDisconnected();
      auditLog.record({ actor: 'user', event: 'google_disconnected', data: { revoked } });
      response.json({ connected: false, revoked });
    });
    return router;
  }
}

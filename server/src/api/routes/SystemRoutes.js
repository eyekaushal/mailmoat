import { Router } from 'express';
import { DeleteAllSchema } from '@mailmoat/shared/schemas/api';
import { validate } from '../validate.js';

/** Health and "Delete all local data" (PRD §9 Privacy, §13). */
export class SystemRoutes {
  #deps;

  /**
   * @param {{
   *   version: string,
   *   googleAuth: Pick<import('../../google/GoogleAuth.js').GoogleAuth, 'isConnected'|'connectedEmail'>,
   *   anthropic: Pick<import('../../llm/AnthropicProvider.js').AnthropicProvider, 'isConfigured'>,
   *   syncState: Pick<import('../../db/repositories/SyncStateRepository.js').SyncStateRepository, 'getLastPollAt'>,
   *   emails: Pick<import('../../db/repositories/EmailRepository.js').EmailRepository, 'count'>,
   *   deleteAllData: () => Promise<void> stops the app and removes the database and key file
   * }} deps
   */
  constructor(deps) {
    this.#deps = deps;
  }

  router() {
    const { version, googleAuth, anthropic, syncState, emails, deleteAllData } = this.#deps;
    const router = Router();

    router.get('/health', (_request, response) => {
      response.json({
        ok: true,
        version,
        google: { connected: googleAuth.isConnected(), email: googleAuth.connectedEmail() ?? null },
        anthropic: { configured: anthropic.isConfigured() },
        sync: {
          lastPollAt: syncState.getLastPollAt()?.toISOString() ?? null,
          emails: emails.count(),
        },
      });
    });
    router.get('/csrf', (_request, response) =>
      response.json({ token: response.locals.csrfToken }),
    );
    router.post('/data/delete-all', async (request, response) => {
      validate(DeleteAllSchema, request.body);
      await deleteAllData();
      response.json({ deleted: true, restart: true });
    });
    return router;
  }
}

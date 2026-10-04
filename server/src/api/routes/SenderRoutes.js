import { Router } from 'express';
import { SenderAddressSchema, SenderListQuerySchema } from '@mailmoat/shared/schemas/api';
import { Avatar } from '../Avatar.js';
import { validate } from '../validate.js';

/**
 * Bulk Unsubscribe and Block (PRD F9). Every button is one call to `UnsubscribeService`, which
 * asks the Policy Engine first; a sender whose mail is not SAFE is never contacted.
 */
export class SenderRoutes {
  #deps;

  /**
   * @param {{
   *   unsubscribes: Pick<import('../../features/UnsubscribeService.js').UnsubscribeService,
   *     'listSenders'|'blockWarning'|'requestUnsubscribe'|'block'|'keep'|'undo'|'archiveAll'>,
   * }} deps
   */
  constructor(deps) {
    this.#deps = deps;
  }

  router() {
    const { unsubscribes } = this.#deps;
    const router = Router();
    const address = (body) => validate(SenderAddressSchema, body).address;

    router.get('/senders', (request, response) => {
      const senders = unsubscribes.listSenders(validate(SenderListQuerySchema, request.query));
      response.json(
        senders.map((sender) => ({
          ...sender,
          avatar: Avatar.for({ name: sender.name, address: sender.address }),
        })),
      );
    });
    router.get('/senders/block-warning', (request, response) => {
      response.json({ warning: unsubscribes.blockWarning(address(request.query)) });
    });
    router.post('/senders/unsubscribe', async (request, response) => {
      response.json(
        await unsubscribes.requestUnsubscribe(address(request.body), { via: 'dashboard' }),
      );
    });
    router.post('/senders/block', async (request, response) => {
      response.json(await unsubscribes.block(address(request.body), { via: 'dashboard' }));
    });
    router.post('/senders/keep', (request, response) => {
      response.json(unsubscribes.keep(address(request.body)));
    });
    router.post('/senders/undo', (request, response) => {
      response.json(unsubscribes.undo(address(request.body)));
    });
    router.post('/senders/archive-all', async (request, response) => {
      response.json(await unsubscribes.archiveAll(address(request.body), { via: 'dashboard' }));
    });
    return router;
  }
}

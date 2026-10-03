import { Router } from 'express';
import { ApprovalEditSchema, IdParamSchema } from '@mailmoat/shared/schemas/api';
import { NotFoundError } from '../../core/errors.js';
import { validate } from '../validate.js';

/**
 * The Approvals page (PRD F12.5): every ASK decision waiting for the user, with the exact
 * action, its content and data sources. Approving re-runs the Policy Engine on the stored call.
 */
export class ApprovalRoutes {
  #deps;

  /**
   * @param {{
   *   approvals: Pick<import('../../actions/ApprovalService.js').ApprovalService, 'listPending'|'get'|'edit'|'approve'|'reject'>,
   *   timeZone: string,
   * }} deps
   */
  constructor(deps) {
    this.#deps = deps;
  }

  router() {
    const { approvals, timeZone } = this.#deps;
    const router = Router();

    router.get('/approvals', (_request, response) => response.json(approvals.listPending()));
    router.get('/approvals/:id', (request, response) => response.json(this.#get(request.params)));
    router.patch('/approvals/:id', (request, response) => {
      const { id } = this.#get(request.params);
      approvals.edit(id, validate(ApprovalEditSchema, request.body));
      response.json(approvals.get(id));
    });
    router.post('/approvals/:id/approve', async (request, response) => {
      const { id } = this.#get(request.params);
      const outcome = await approvals.approve(id, { via: 'dashboard', timeZone });
      response.json(
        outcome.status === 'performed'
          ? { id, status: 'performed', result: outcome.result.value }
          : { id, status: 'denied', reason: outcome.reason },
      );
    });
    router.post('/approvals/:id/reject', (request, response) => {
      const { id } = this.#get(request.params);
      approvals.reject(id, { via: 'dashboard' });
      response.json({ id, status: 'rejected' });
    });
    return router;
  }

  #get(params) {
    const { id } = validate(IdParamSchema, params);
    const approval = this.#deps.approvals.get(id);
    if (!approval) throw new NotFoundError('Unknown approval');
    return approval;
  }
}

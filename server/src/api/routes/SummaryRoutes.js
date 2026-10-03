import { Router } from 'express';

/** The Today card (PRD F14). */
export class SummaryRoutes {
  #deps;

  /** @param {{ summary: Pick<import('../../features/SummaryService.js').SummaryService, 'today'> }} deps */
  constructor(deps) {
    this.#deps = deps;
  }

  router() {
    const router = Router();
    router.get('/summary/today', (_request, response) => response.json(this.#deps.summary.today()));
    return router;
  }
}

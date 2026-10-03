import { Router } from 'express';
import {
  AuditQuerySchema,
  FeedQuerySchema,
  OverviewQuerySchema,
} from '@mailmoat/shared/schemas/api';
import { validate } from '../validate.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPORT_LIMIT = 10_000;

/** The Security Center (PRD F11): overview numbers, the threat feed and the audit log. */
export class SecurityRoutes {
  #deps;

  /**
   * @param {{
   *   verdicts: Pick<import('../../db/repositories/VerdictRepository.js').VerdictRepository, 'counts'|'listFlagged'>,
   *   audit: Pick<import('../../db/repositories/AuditLogRepository.js').AuditLogRepository, 'recent'|'count'>,
   *   approvals: Pick<import('../../actions/ApprovalService.js').ApprovalService, 'listPending'>,
   *   now?: () => Date,
   * }} deps
   */
  constructor(deps) {
    this.#deps = { now: () => new Date(), ...deps };
  }

  router() {
    const { verdicts, audit, approvals, now } = this.#deps;
    const router = Router();

    router.get('/security/overview', (request, response) => {
      const { days } = validate(OverviewQuerySchema, request.query);
      const since = new Date(now().getTime() - days * DAY_MS).toISOString();
      response.json({
        days,
        since,
        ...verdicts.counts({ since }),
        denied: audit.count({ event: 'policy_decision', decision: 'DENY', since }),
        asked: audit.count({ event: 'policy_decision', decision: 'ASK', since }),
        pendingApprovals: approvals.listPending().length,
      });
    });
    router.get('/security/feed', (request, response) => {
      const { limit } = validate(FeedQuerySchema, request.query);
      response.json(verdicts.listFlagged({ limit }));
    });
    router.get('/audit', (request, response) => {
      const { filter, subject, limit } = validate(AuditQuerySchema, request.query);
      response.json(audit.recent({ event: filter, subject, limit }));
    });
    router.get('/audit/export', (_request, response) => {
      const stamp = now().toISOString().slice(0, 10);
      response
        .attachment(`mailmoat-audit-${stamp}.json`)
        .json({ exportedAt: now().toISOString(), entries: audit.recent({ limit: EXPORT_LIMIT }) });
    });
    return router;
  }
}

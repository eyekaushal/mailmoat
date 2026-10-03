import { Router } from 'express';
import {
  IdParamSchema,
  ProcessPastSchema,
  RuleHistoryQuerySchema,
  RulePatchSchema,
  RuleTestSchema,
} from '@mailmoat/shared/schemas/api';
import { NotFoundError } from '../../core/errors.js';
import { validate } from '../validate.js';

const HEADER_LINE = /^[A-Za-z][A-Za-z0-9-]*:\s/;

/**
 * The Assistant page (PRD F4): Rules, Test and History tabs plus "Process past emails".
 * The Test tab runs the real pipeline's side-effect-free `analyse` and the rule matcher, so it
 * reproduces exactly what the live pipeline would do, without labelling or drafting anything.
 */
export class RuleRoutes {
  #deps;
  /** @type {{ status: 'idle'|'running'|'done'|'failed', done: number, total: number, result: object | null, error: string | null }} */
  #job = { status: 'idle', done: 0, total: 0, result: null, error: null };

  /**
   * @param {{
   *   ruleEngine: Pick<import('../../rules/RuleEngine.js').RuleEngine, 'list'|'update'|'evaluate'|'history'|'processPast'>,
   *   pipeline: Pick<import('../../security/SecurityPipeline.js').SecurityPipeline, 'analyse'>,
   *   emails: Pick<import('../../db/repositories/EmailRepository.js').EmailRepository, 'get'>,
   *   gmail: Pick<import('../../google/GmailClient.js').GmailClient, 'getRawMessage'>,
   *   logger: import('../../core/Logger.js').Logger,
   *   now?: () => Date,
   * }} deps
   */
  constructor(deps) {
    this.#deps = { now: () => new Date(), ...deps };
  }

  router() {
    const { ruleEngine } = this.#deps;
    const router = Router();

    router.get('/rules', (_request, response) => response.json(ruleEngine.list()));
    router.patch('/rules/:id', (request, response) => {
      const { id } = validate(IdParamSchema, request.params);
      const changes = validate(RulePatchSchema, request.body);
      ruleEngine.update(id, changes);
      response.json(ruleEngine.list().find((rule) => rule.id === id));
    });
    router.post('/rules/test', async (request, response) => {
      const input = validate(RuleTestSchema, request.body);
      response.json(await this.#test(input));
    });
    router.get('/rules/history', (request, response) => {
      response.json(ruleEngine.history(validate(RuleHistoryQuerySchema, request.query)));
    });
    router.post('/rules/process-past', (request, response) => {
      const { days } = validate(ProcessPastSchema, request.body ?? {});
      if (this.#job.status !== 'running') this.#startProcessPast(days);
      response.status(202).json(this.#job);
    });
    router.get('/rules/process-past', (_request, response) => response.json(this.#job));
    return router;
  }

  async #test({ raw, gmailId }) {
    const { ruleEngine, pipeline, emails, gmail, now } = this.#deps;
    let record;
    let bytes;
    if (gmailId) {
      record = emails.get(gmailId);
      if (!record) throw new NotFoundError('Unknown email');
      bytes = (await gmail.getRawMessage(gmailId)).raw;
    } else {
      record = RuleRoutes.#pastedRecord(now());
      bytes = Buffer.from(RuleRoutes.#asRawMessage(raw), 'utf8');
    }
    const analysis = await pipeline.analyse(bytes, {
      direction: record.direction,
      receivedAt: new Date(record.date),
    });
    const { email, signals, reader, verdict } = analysis;
    return {
      auth: email?.auth ?? null,
      hidden: email?.hidden ?? [],
      links: (email?.links ?? []).map(({ href, text }) => ({ href, text })),
      signals: signals.map(({ id, severity, reason }) => ({ id, severity, reason })),
      reader,
      verdict,
      matches: ruleEngine.evaluate(record, analysis),
    };
  }

  #startProcessPast(days) {
    const { ruleEngine, logger } = this.#deps;
    this.#job = { status: 'running', done: 0, total: 0, result: null, error: null };
    ruleEngine
      .processPast({
        days,
        onProgress: ({ done, total }) => Object.assign(this.#job, { done, total }),
      })
      .then((result) => Object.assign(this.#job, { status: 'done', result }))
      .catch((error) => {
        logger.error('process past emails failed', { error: error.name });
        Object.assign(this.#job, { status: 'failed', error: error.message });
      });
  }

  /** A raw message passes through untouched; pasted plain text is wrapped so it parses. */
  static #asRawMessage(text) {
    if (HEADER_LINE.test(text.replace(/^\s+/, ''))) return text;
    return `From: unknown@example.invalid\nSubject: (pasted text)\n\n${text}`;
  }

  static #pastedRecord(now) {
    return {
      gmailId: 'test',
      threadId: 'test',
      direction: 'inbound',
      fromAddr: 'unknown@example.invalid',
      fromDomain: 'example.invalid',
      fromName: null,
      toAddrs: [],
      recipientNames: {},
      date: now.toISOString(),
      subjectHash: null,
      hasListUnsubscribe: false,
      unsubscribeUrl: null,
      oneClick: false,
      labels: [],
      isRead: false,
    };
  }
}

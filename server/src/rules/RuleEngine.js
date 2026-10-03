import { RULE_ACTIONS } from '@mailmoat/shared/constants/rules';
import { TaggedValue } from '../agent/TaggedValue.js';
import { RuleError } from '../core/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PAST_DAYS = 7;

/**
 * @typedef {{ ruleId: string, name: string, isSecurity: boolean, actions: string[] }} RuleMatch
 * @typedef {RuleMatch & { actionsTaken: string[], status: 'done'|'failed' }} RuleRun
 */

/**
 * Maps each analysed email to the predefined rules (PRD F4) from typed facts only, then performs
 * the rule's actions. Labelling and archiving go through the Policy Engine and ActionExecutor
 * like any other action, so rules get the same validation and audit trail as the agent.
 *
 * Security rules are always on. Their labels are applied by the SecurityPipeline itself (code
 * the user cannot switch off); here they are recorded and raised as alerts. A risky email never
 * gets assistant actions: no label, archive or draft is applied to SUSPICIOUS or DANGEROUS mail.
 */
export class RuleEngine {
  #deps;

  /**
   * @param {object} deps
   * @param {Pick<import('../security/SecurityPipeline.js').SecurityPipeline, 'process'>} deps.pipeline
   * @param {Pick<import('./BlockedSenderFilter.js').BlockedSenderFilter, 'handle'>} deps.blocked
   * @param {import('./PredefinedRules.js').PredefinedRules} deps.rules
   * @param {import('../db/repositories/RuleRepository.js').RuleRepository} deps.repository
   * @param {Pick<import('../db/repositories/EmailRepository.js').EmailRepository, 'latestInThread'|'listProcessedSince'>} deps.emails
   * @param {Pick<import('../db/repositories/VerdictRepository.js').VerdictRepository, 'get'|'readerForm'|'signals'>} deps.verdicts
   * @param {Pick<import('../policy/PolicyEngine.js').PolicyEngine, 'decide'>} deps.policy
   * @param {Pick<import('../actions/ActionExecutor.js').ActionExecutor, 'perform'>} deps.executor
   * @param {{ createReply(input: { gmailId: string, instructions: string | null }): Promise<{ draftId: string }> }} deps.drafts the DraftService (B19)
   * @param {Pick<import('../db/repositories/SettingsRepository.js').SettingsRepository, 'get'>} deps.settings
   * @param {Pick<import('../audit/AuditLog.js').AuditLog, 'record'>} deps.auditLog
   * @param {import('../core/Logger.js').Logger} deps.logger
   * @param {string} deps.timeZone
   * @param {() => Date} [deps.now]
   */
  constructor(deps) {
    this.#deps = { now: () => new Date(), ...deps };
    // Rows for new rules get their defaults; the user's existing toggles and actions are kept.
    deps.repository.seed(
      deps.rules.list().map(({ id, name, defaultActions, isSecurity }) => ({
        id,
        name,
        actions: defaultActions,
        isSecurity,
      })),
    );
  }

  /** The Rules tab: definitions merged with the user's settings. */
  list() {
    const stored = new Map(this.#deps.repository.list().map((rule) => [rule.id, rule]));
    return this.#deps.rules.list().map((rule) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      isSecurity: rule.isSecurity,
      label: rule.label,
      enabled: stored.get(rule.id).enabled,
      actions: stored.get(rule.id).actions,
      allowedActions: [...rule.allowedActions],
    }));
  }

  /**
   * @param {string} id
   * @param {{ enabled?: boolean, actions?: string[] }} changes
   * @throws {RuleError} for an unknown or security rule, or an action the rule does not allow
   */
  update(id, { enabled, actions } = {}) {
    const rule = this.#deps.rules.get(id);
    if (!rule) throw new RuleError(`Unknown rule: ${id}`);
    if (rule.isSecurity) throw new RuleError(`${rule.name} is a security rule and always on`);
    if (actions !== undefined) {
      const invalid = actions.filter(
        (action) => !RULE_ACTIONS.includes(action) || !rule.allowedActions.includes(action),
      );
      if (invalid.length > 0 || new Set(actions).size !== actions.length) {
        throw new RuleError(`${rule.name} does not allow these actions: ${invalid.join(', ')}`);
      }
    }
    this.#deps.repository.update(id, { enabled, actions });
    this.#deps.auditLog.record({
      actor: 'user',
      event: 'rule_updated',
      subject: id,
      data: { enabled, actions },
    });
  }

  /**
   * GmailSync processor: blocked senders are filed away first (F9.4), then the security
   * pipeline, then the rules.
   * @param {import('../sync/EmailMetadataMapper.js').EmailRecord} record
   * @returns {Promise<import('../security/SecurityPipeline.js').Analysis & { rules: RuleRun[], blocked: boolean }>}
   */
  async process(record) {
    if (await this.#deps.blocked.handle(record)) {
      return {
        email: null,
        signals: [],
        reader: { failed: false, form: null },
        verdict: null,
        rules: [],
        blocked: true,
      };
    }
    const analysis = await this.#deps.pipeline.process(record);
    return { ...analysis, rules: await this.apply(record, analysis), blocked: false };
  }

  /**
   * Which rules match and what they would do. Side-effect free: the Test tab (F4.3) shows this.
   * @param {import('../sync/EmailMetadataMapper.js').EmailRecord} record
   * @param {Pick<import('../security/SecurityPipeline.js').Analysis, 'signals'|'reader'|'verdict'>} analysis
   * @returns {RuleMatch[]}
   */
  evaluate(record, analysis) {
    const { rules, repository, settings } = this.#deps;
    const facts = this.#facts(record, analysis);
    const stored = new Map(repository.list().map((rule) => [rule.id, rule]));
    const applicable = rules
      .list()
      .filter((rule) => rule.appliesTo === facts.direction && stored.get(rule.id).enabled);

    const security = applicable.filter((rule) => rule.isSecurity && rule.matches(facts));
    if (security.length > 0) {
      return security.map((rule) => ({
        ruleId: rule.id,
        name: rule.name,
        isSecurity: true,
        actions:
          rule.id === 'dangerous' && settings.get('autoArchiveDangerous', false) === true
            ? [...rule.defaultActions, 'archive']
            : [...rule.defaultActions],
      }));
    }
    const assistant = applicable.find((rule) => !rule.isSecurity && rule.matches(facts));
    if (!assistant) return [];
    return [
      {
        ruleId: assistant.id,
        name: assistant.name,
        isSecurity: false,
        actions: [...stored.get(assistant.id).actions],
      },
    ];
  }

  /**
   * Evaluates and performs the actions, recording a `rule_runs` row and an audit entry per
   * matched rule. A failing action is recorded and logged; it does not fail the email, so the
   * sync does not re-run the Reader for a Gmail hiccup.
   * @returns {Promise<RuleRun[]>}
   */
  async apply(record, analysis) {
    const { repository, auditLog, logger, now } = this.#deps;
    const runs = [];
    for (const match of this.evaluate(record, analysis)) {
      const actionsTaken = [];
      const failed = [];
      for (const action of match.actions) {
        try {
          await this.#perform(action, match, record);
          actionsTaken.push(action);
        } catch (error) {
          failed.push(action);
          logger.warn('rule action failed', {
            gmailId: record.gmailId,
            ruleId: match.ruleId,
            action,
            error: error.name,
          });
        }
      }
      const status = failed.length === 0 ? 'done' : 'failed';
      repository.recordRun({
        gmailId: record.gmailId,
        ruleId: match.ruleId,
        actionsTaken,
        status,
        at: now(),
      });
      // For security rules this entry *is* the alert / log the Security Center shows.
      auditLog.record({
        actor: 'system',
        event: 'rule_applied',
        subject: record.gmailId,
        decision: status,
        reason: match.name,
        data: {
          ruleId: match.ruleId,
          isSecurity: match.isSecurity,
          actions: actionsTaken,
          failed,
          level: analysis.verdict?.level ?? null,
        },
      });
      runs.push({ ...match, actionsTaken, status });
    }
    return runs;
  }

  /**
   * "Process past emails" (F4.5): re-runs the rules on everything from the last `days` days.
   * Emails the pipeline never analysed (e.g. backfilled metadata) go through it first.
   * @param {{ days?: number, onProgress?: (p: { done: number, total: number }) => void }} [options]
   * @returns {Promise<{ total: number, analysed: number, matched: number, failed: number }>}
   */
  async processPast({ days = DEFAULT_PAST_DAYS, onProgress } = {}) {
    const { pipeline, emails, logger, now } = this.#deps;
    const since = new Date(now().getTime() - days * DAY_MS).toISOString();
    const records = emails.listProcessedSince(since);
    const result = { total: records.length, analysed: 0, matched: 0, failed: 0 };
    let done = 0;
    for (const record of records) {
      try {
        let analysis = this.#storedAnalysis(record);
        if (!analysis) {
          analysis = await pipeline.process(record);
          result.analysed += 1;
        }
        if ((await this.apply(record, analysis)).length > 0) result.matched += 1;
      } catch (error) {
        result.failed += 1;
        logger.warn('process-past failed for an email', { gmailId: record.gmailId, error });
      }
      done += 1;
      onProgress?.({ done, total: records.length });
    }
    return result;
  }

  /** @param {{ ruleId?: string, level?: string, limit?: number }} [filter] */
  history(filter) {
    return this.#deps.repository.history(filter);
  }

  /** @returns {import('./PredefinedRules.js').RuleFacts} */
  #facts(record, analysis) {
    const latest = this.#deps.emails.latestInThread(record.threadId);
    return {
      direction: record.direction,
      level: analysis.verdict?.level ?? null,
      injectionAttempt: analysis.verdict?.injectionAttempt === true,
      form: analysis.reader.form,
      firstTimeSender: analysis.signals.some((signal) => signal.id === 'S9'),
      lastInThreadFromUser: (latest ?? record).direction === 'outbound',
    };
  }

  /** What the pipeline stored earlier, in the shape `evaluate` expects; null if never analysed. */
  #storedAnalysis(record) {
    const { verdicts } = this.#deps;
    const form = verdicts.readerForm(record.gmailId);
    const verdict = verdicts.get(record.gmailId) ?? null;
    if (!form || (record.direction === 'inbound' && !verdict)) return null;
    return { signals: verdicts.signals(record.gmailId), reader: { failed: false, form }, verdict };
  }

  async #perform(action, match, record) {
    const { drafts, repository } = this.#deps;
    switch (action) {
      case 'label':
        // Security labels were applied by the pipeline (invariant: code-only, never optional).
        if (match.isSecurity) return;
        return this.#organise('apply_label', record, {
          label: TaggedValue.fromUser(this.#deps.rules.get(match.ruleId).label),
        });
      case 'archive':
        if (match.isSecurity) return;
        return this.#organise('archive', record, {});
      case 'draft_reply': {
        // Re-running the rules must not pile up drafts for the same email.
        const earlier = repository
          .runsFor(record.gmailId)
          .find((run) => run.ruleId === match.ruleId);
        if (earlier?.actionsTaken.includes('draft_reply')) return;
        await drafts.createReply({ gmailId: record.gmailId, instructions: null });
        return;
      }
      case 'alert':
      case 'log':
        return; // the audit entry written by `apply` is the alert / log
      default:
        throw new RuleError(`Unknown rule action: ${action}`);
    }
  }

  /** Runs a reversible Gmail change through the Policy Engine and the one executor. */
  async #organise(tool, record, extraArgs) {
    const { policy, executor, now, timeZone } = this.#deps;
    const call = {
      step: 0,
      tool,
      args: { email_id: TaggedValue.fromOwnData(record.gmailId, 'inbox'), ...extraArgs },
      emailIds: [record.gmailId],
    };
    const decision = policy.decide(call);
    if (decision.outcome !== 'ALLOW') {
      throw new RuleError(`${tool} not allowed by policy: ${decision.reason}`);
    }
    await executor.perform(call, { now: now(), timeZone });
  }
}

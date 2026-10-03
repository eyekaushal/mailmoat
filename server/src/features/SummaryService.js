import { WorkingHours } from './WorkingHours.js';

const MAX_HIGHLIGHTS = 5;

/**
 * The "Today" card (PRD F14): counts from typed fields and verdicts, plus a few Reader summaries
 * of mail that needs a reply, each marked as untrusted text. Nothing here is computed by a model.
 */
export class SummaryService {
  #deps;

  /**
   * @param {object} deps
   * @param {Pick<import('../db/repositories/EmailRepository.js').EmailRepository, 'listProcessedSince'>} deps.emails
   * @param {Pick<import('../db/repositories/VerdictRepository.js').VerdictRepository, 'get'|'readerForm'>} deps.verdicts
   * @param {Pick<import('../db/repositories/RuleRepository.js').RuleRepository, 'runsFor'>} deps.rules
   * @param {import('../rules/PredefinedRules.js').PredefinedRules} deps.predefined
   * @param {string} deps.timeZone
   * @param {() => Date} [deps.now]
   */
  constructor(deps) {
    this.#deps = { now: () => new Date(), ...deps };
  }

  /**
   * @returns {{
   *   date: string, since: string, received: number, byRule: Record<string, number>,
   *   needsReply: number, meetingsProposed: number,
   *   threats: { suspicious: number, dangerous: number, injection: number },
   *   highlights: { gmailId: string, from: string, date: string, summary: string, untrusted: true }[],
   * }}
   */
  today() {
    const { emails, verdicts, rules, predefined, timeZone, now } = this.#deps;
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now());
    const since = new WorkingHours({ timeZone }).resolve(date).toISOString();
    const names = new Map(predefined.list().map((rule) => [rule.id, rule.name]));

    const summary = {
      date,
      since,
      received: 0,
      byRule: {},
      needsReply: 0,
      meetingsProposed: 0,
      threats: { suspicious: 0, dangerous: 0, injection: 0 },
      highlights: [],
    };
    for (const record of emails.listProcessedSince(since)) {
      if (record.direction !== 'inbound') continue;
      summary.received += 1;
      for (const run of rules.runsFor(record.gmailId)) {
        const name = names.get(run.ruleId) ?? run.ruleId;
        summary.byRule[name] = (summary.byRule[name] ?? 0) + 1;
      }
      const verdict = verdicts.get(record.gmailId);
      if (verdict?.level === 'SUSPICIOUS') summary.threats.suspicious += 1;
      if (verdict?.level === 'DANGEROUS') summary.threats.dangerous += 1;
      if (verdict?.injectionAttempt) summary.threats.injection += 1;
      const form = verdicts.readerForm(record.gmailId);
      if (form?.meeting_request) summary.meetingsProposed += 1;
      if (form?.needs_reply) {
        summary.needsReply += 1;
        if (verdict?.level === 'SAFE' && summary.highlights.length < MAX_HIGHLIGHTS) {
          summary.highlights.push({
            gmailId: record.gmailId,
            from: record.fromAddr,
            date: record.date,
            summary: form.summary,
            untrusted: true,
          });
        }
      }
    }
    return summary;
  }
}

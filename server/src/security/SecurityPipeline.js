import { SECURITY_LABELS } from '@mailmoat/shared/constants/labels';
import { IngestError } from '../core/errors.js';

const UNTRUSTED_AUTH = {
  trusted: false,
  spf: { result: 'none', mailFrom: null },
  dkim: [],
  dmarc: { result: 'none', headerFrom: null },
};

/**
 * @typedef {object} Analysis
 * @property {import('./ingest/EmailIngestor.js').IngestedEmail | null} email null if it could not be parsed
 * @property {import('./signals/Signal.js').SignalResult[]} signals
 * @property {import('./reader/Reader.js').ReaderResult} reader
 * @property {import('./risk/Verdict.js').Verdict | null} verdict null for the user's own sent mail
 */

/**
 * Runs layers 1–4 on one email (Ingest → Reader → Signals → Risk), then stores the outcome,
 * applies the Gmail security labels and writes the audit log.
 *
 * `analyse` is side-effect free (the attack lab and the Test tab use it); `process` is what
 * GmailSync calls for each new message. Analysis problems fail closed into a SUSPICIOUS verdict;
 * only Gmail/database I/O errors are thrown, so GmailSync retries the message later.
 */
export class SecurityPipeline {
  #deps;

  /**
   * @param {object} deps
   * @param {Pick<import('../google/GmailClient.js').GmailClient, 'getRawMessage'|'ensureLabel'|'modifyLabels'|'archive'>} deps.gmail
   * @param {import('./ingest/EmailIngestor.js').EmailIngestor} deps.ingestor
   * @param {Pick<import('./reader/Reader.js').Reader, 'read'>} deps.reader
   * @param {import('./signals/SignalEngine.js').SignalEngine} deps.signalEngine
   * @param {import('./risk/RiskEngine.js').RiskEngine} deps.riskEngine
   * @param {import('./signals/Signal.js').SignalContext['contacts']} deps.contacts
   * @param {import('../db/repositories/VerdictRepository.js').VerdictRepository} deps.verdicts
   * @param {Pick<import('../db/repositories/SettingsRepository.js').SettingsRepository, 'get'>} deps.settings
   * @param {Pick<import('../audit/AuditLog.js').AuditLog, 'record'>} deps.auditLog
   * @param {string} deps.readerModel stored with each Reader form
   * @param {string} deps.timeZone the user's IANA time zone, for the Reader's date resolution
   * @param {import('../core/Logger.js').Logger} deps.logger
   * @param {() => Date} [deps.now]
   */
  constructor(deps) {
    this.#deps = { now: () => new Date(), ...deps };
  }

  /**
   * @param {Buffer} raw
   * @param {{ direction: 'inbound'|'outbound', receivedAt: Date }} meta trusted facts from Gmail
   * @returns {Promise<Analysis>}
   */
  async analyse(raw, { direction, receivedAt }) {
    const { ingestor, reader, signalEngine, riskEngine, contacts, timeZone } = this.#deps;
    let email;
    try {
      email = await ingestor.ingest(raw);
    } catch (error) {
      if (!(error instanceof IngestError)) throw error;
      const unreadable = { failed: true, form: null, reason: 'The email could not be parsed.' };
      const signals = [
        {
          id: 'S0',
          name: 'INGEST_ERROR',
          severity: 'high',
          reason: 'The email could not be parsed.',
        },
      ];
      return {
        email: null,
        signals,
        reader: unreadable,
        verdict: riskEngine.evaluate(signals, unreadable),
      };
    }

    const readerResult = await reader.read(email, { direction, receivedAt, timeZone });
    // The user's own sent mail is read (for "Awaiting Reply") but not risk-scored.
    if (direction === 'outbound')
      return { email, signals: [], reader: readerResult, verdict: null };

    const signals = signalEngine.evaluate(email, { contacts, readerForm: readerResult.form });
    return {
      email,
      signals,
      reader: readerResult,
      verdict: riskEngine.evaluate(signals, readerResult),
    };
  }

  /**
   * GmailSync processor: analyse, store, label, audit.
   * @param {import('../sync/EmailMetadataMapper.js').EmailRecord} record
   */
  async process(record) {
    const { gmail, verdicts, auditLog, readerModel, now } = this.#deps;
    const { raw } = await gmail.getRawMessage(record.gmailId);
    const analysis = await this.analyse(raw, {
      direction: record.direction,
      receivedAt: new Date(record.date),
    });
    const { email, signals, reader, verdict } = analysis;

    verdicts.save({
      gmailId: record.gmailId,
      at: now(),
      bodyHash: email?.bodyHash ?? null,
      auth: email?.auth ?? UNTRUSTED_AUTH,
      signals,
      readerForm: reader.form,
      readerModel,
      verdict,
    });
    auditLog.record({
      actor: 'system',
      event: 'email_analysed',
      subject: record.gmailId,
      decision: verdict?.level ?? null,
      reason: verdict?.reasons[0] ?? null,
      data: {
        direction: record.direction,
        score: verdict?.score ?? null,
        floor: verdict?.floor ?? null,
        reasons: verdict?.reasons ?? [],
        signals: signals.map(({ id, severity, reason }) => ({ id, severity, reason })),
        readerFailed: reader.failed,
        readerForm: reader.form,
        injectionAttempt: verdict?.injectionAttempt ?? false,
      },
    });
    if (verdict) await this.#applyLabels(record.gmailId, verdict);
    return analysis;
  }

  async #applyLabels(gmailId, verdict) {
    const { gmail, settings, auditLog } = this.#deps;
    const names = [];
    if (verdict.level === 'SUSPICIOUS') names.push(SECURITY_LABELS.SUSPICIOUS);
    if (verdict.level === 'DANGEROUS') names.push(SECURITY_LABELS.DANGEROUS);
    if (verdict.injectionAttempt) names.push(SECURITY_LABELS.INJECTION);
    if (names.length === 0) return;

    const labelIds = [];
    for (const name of names) labelIds.push(await gmail.ensureLabel(name));
    await gmail.modifyLabels(gmailId, { add: labelIds });

    const archive =
      verdict.level === 'DANGEROUS' && settings.get('autoArchiveDangerous', false) === true;
    if (archive) await gmail.archive(gmailId);
    auditLog.record({
      actor: 'system',
      event: 'security_labels_applied',
      subject: gmailId,
      decision: verdict.level,
      data: { labels: names, archived: archive },
    });
  }
}

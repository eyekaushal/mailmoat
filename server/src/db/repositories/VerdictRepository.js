/**
 * Stores everything the security pipeline concluded about one email, in one transaction:
 * auth results, fired signals, the Reader form, the verdict and the body hash.
 */
export class VerdictRepository {
  #db;

  /** @param {import('../Database.js').Database} db */
  constructor(db) {
    this.#db = db;
  }

  /**
   * @param {object} outcome
   * @param {string} outcome.gmailId
   * @param {Date} outcome.at
   * @param {string} outcome.bodyHash
   * @param {import('../../security/ingest/AuthResultsParser.js').AuthResults} outcome.auth
   * @param {import('../../security/signals/Signal.js').SignalResult[]} outcome.signals
   * @param {import('@mailmoat/shared/schemas/reader-form').ReaderForm | null} outcome.readerForm
   * @param {string} outcome.readerModel
   * @param {import('../../security/risk/Verdict.js').Verdict | null} outcome.verdict null for the user's own sent mail
   */
  save({ gmailId, at, bodyHash, auth, signals, readerForm, readerModel, verdict }) {
    const iso = at.toISOString();
    this.#db.transaction(() => {
      this.#db.run('UPDATE emails SET body_hash = ? WHERE gmail_id = ?', [bodyHash, gmailId]);
      this.#db.run(
        `INSERT OR REPLACE INTO auth_results (gmail_id, spf, dkim, dkim_domain, dmarc)
         VALUES (?, ?, ?, ?, ?)`,
        [
          gmailId,
          auth.spf.result,
          auth.dkim[0]?.result ?? 'none',
          auth.dkim[0]?.domain ?? null,
          auth.dmarc.result,
        ],
      );
      this.#db.run('DELETE FROM signals WHERE gmail_id = ?', [gmailId]);
      for (const signal of signals) {
        this.#db.run(
          'INSERT INTO signals (gmail_id, signal_id, severity, reason) VALUES (?, ?, ?, ?)',
          [gmailId, signal.id, signal.severity, signal.reason],
        );
      }
      if (readerForm) {
        this.#db.run(
          `INSERT OR REPLACE INTO reader_forms (gmail_id, json, model, created_at) VALUES (?, ?, ?, ?)`,
          [gmailId, JSON.stringify(readerForm), readerModel, iso],
        );
      }
      if (verdict) {
        this.#db.run(
          `INSERT OR REPLACE INTO verdicts
             (gmail_id, level, score, reasons_json, floor, injection_attempt, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            gmailId,
            verdict.level,
            verdict.score,
            JSON.stringify(verdict.reasons),
            verdict.floor,
            Number(verdict.injectionAttempt),
            iso,
          ],
        );
      }
    });
  }

  /**
   * @returns {{ level: string, score: number, reasons: string[], floor: string,
   *   injectionAttempt: boolean, userFeedback: string | null, createdAt: string } | undefined}
   */
  get(gmailId) {
    const row = this.#db.get('SELECT * FROM verdicts WHERE gmail_id = ?', [gmailId]);
    return (
      row && {
        level: row.level,
        score: row.score,
        reasons: JSON.parse(row.reasons_json),
        floor: row.floor,
        injectionAttempt: row.injection_attempt === 1,
        userFeedback: row.user_feedback ?? null,
        createdAt: row.created_at,
      }
    );
  }

  /**
   * The user's "Not phishing" feedback (PRD F3.9): a user-sourced fact beside the verdict. The
   * level is never lowered (invariant 5).
   * @param {string} gmailId
   * @param {'not_phishing' | null} feedback
   * @returns {boolean} false if the email has no verdict
   */
  setFeedback(gmailId, feedback) {
    const { changes } = this.#db.run('UPDATE verdicts SET user_feedback = ? WHERE gmail_id = ?', [
      feedback,
      gmailId,
    ]);
    return Number(changes) > 0;
  }

  /** @returns {{ spf: string, dkim: string, dkimDomain: string | null, dmarc: string } | undefined} */
  auth(gmailId) {
    const row = this.#db.get('SELECT * FROM auth_results WHERE gmail_id = ?', [gmailId]);
    return row && { spf: row.spf, dkim: row.dkim, dkimDomain: row.dkim_domain, dmarc: row.dmarc };
  }

  /**
   * Security Center overview numbers (F11.1) for verdicts stored since `since`.
   * @param {{ since: string }} range ISO time
   * @returns {{ scanned: number, safe: number, suspicious: number, dangerous: number, injectionAttempts: number }}
   */
  counts({ since }) {
    const row = this.#db.get(
      `SELECT COUNT(*) AS scanned,
              SUM(level = 'SAFE') AS safe,
              SUM(level = 'SUSPICIOUS') AS suspicious,
              SUM(level = 'DANGEROUS') AS dangerous,
              SUM(injection_attempt) AS injection_attempts
       FROM verdicts WHERE created_at >= ?`,
      [since],
    );
    return {
      scanned: row.scanned,
      safe: row.safe ?? 0,
      suspicious: row.suspicious ?? 0,
      dangerous: row.dangerous ?? 0,
      injectionAttempts: row.injection_attempts ?? 0,
    };
  }

  /**
   * The Security Center feed (F11.2): non-SAFE verdicts, newest first, with sender metadata.
   * @param {{ limit?: number }} [filter]
   * @returns {{ gmailId: string, fromAddr: string, fromDomain: string, fromName: string | null,
   *   date: string, level: string, score: number, reasons: string[], injectionAttempt: boolean,
   *   userFeedback: string | null, createdAt: string }[]}
   */
  listFlagged({ limit = 100 } = {}) {
    return this.#db
      .all(
        `SELECT v.*, e.from_addr, e.from_domain, e.from_name, e.date
         FROM verdicts v JOIN emails e ON e.gmail_id = v.gmail_id
         WHERE v.level <> 'SAFE'
         ORDER BY v.created_at DESC, v.gmail_id DESC LIMIT ?`,
        [limit],
      )
      .map((row) => ({
        gmailId: row.gmail_id,
        fromAddr: row.from_addr,
        fromDomain: row.from_domain,
        fromName: row.from_name,
        date: row.date,
        level: row.level,
        score: row.score,
        reasons: JSON.parse(row.reasons_json),
        injectionAttempt: row.injection_attempt === 1,
        userFeedback: row.user_feedback ?? null,
        createdAt: row.created_at,
      }));
  }

  /** @returns {import('@mailmoat/shared/schemas/reader-form').ReaderForm | undefined} */
  readerForm(gmailId) {
    const row = this.#db.get('SELECT json FROM reader_forms WHERE gmail_id = ?', [gmailId]);
    return row && JSON.parse(row.json);
  }

  /** @returns {{ id: string, severity: string, reason: string }[]} */
  signals(gmailId) {
    return this.#db
      .all(
        'SELECT signal_id, severity, reason FROM signals WHERE gmail_id = ? ORDER BY signal_id',
        [gmailId],
      )
      .map((row) => ({ id: row.signal_id, severity: row.severity, reason: row.reason }));
  }
}

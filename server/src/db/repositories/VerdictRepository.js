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
          `INSERT OR REPLACE INTO verdicts (gmail_id, level, score, reasons_json, floor, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            gmailId,
            verdict.level,
            verdict.score,
            JSON.stringify(verdict.reasons),
            verdict.floor,
            iso,
          ],
        );
      }
    });
  }

  /**
   * @returns {{ level: string, score: number, reasons: string[], floor: string, createdAt: string } | undefined}
   */
  get(gmailId) {
    const row = this.#db.get('SELECT * FROM verdicts WHERE gmail_id = ?', [gmailId]);
    return (
      row && {
        level: row.level,
        score: row.score,
        reasons: JSON.parse(row.reasons_json),
        floor: row.floor,
        createdAt: row.created_at,
      }
    );
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

/**
 * @typedef {object} ApprovalRow
 * @property {string} id
 * @property {string} kind the tool name
 * @property {unknown} payload the stored call (step, tool, tagged args, reason)
 * @property {unknown[]} sources provenance summary for the approvals page
 * @property {'PENDING'|'APPROVED'|'REJECTED'|'EXPIRED'} status
 * @property {string} requestedAt
 * @property {string | null} decidedAt
 * @property {string | null} decidedVia
 */

/** Pending and decided approval requests (PRD F12.5). */
export class ApprovalRepository {
  #db;

  /** @param {import('../Database.js').Database} db */
  constructor(db) {
    this.#db = db;
  }

  /** @param {{ id: string, kind: string, payload: unknown, sources: unknown[], requestedAt: string }} approval */
  create({ id, kind, payload, sources, requestedAt }) {
    this.#db.run(
      `INSERT INTO approvals (id, kind, payload_json, sources_json, status, requested_at)
       VALUES (?, ?, ?, ?, 'PENDING', ?)`,
      [id, kind, JSON.stringify(payload), JSON.stringify(sources), requestedAt],
    );
  }

  /** @returns {ApprovalRow | undefined} */
  get(id) {
    const row = this.#db.get('SELECT * FROM approvals WHERE id = ?', [id]);
    return row && this.#toRow(row);
  }

  /** @returns {ApprovalRow[]} oldest first */
  listPending() {
    return this.#db
      .all("SELECT * FROM approvals WHERE status = 'PENDING' ORDER BY requested_at", [])
      .map((row) => this.#toRow(row));
  }

  /** Replaces the stored call of a pending approval (the user edited it). */
  updatePayload(id, payload) {
    this.#db.run("UPDATE approvals SET payload_json = ? WHERE id = ? AND status = 'PENDING'", [
      JSON.stringify(payload),
      id,
    ]);
  }

  /**
   * @param {string} id
   * @param {{ status: 'APPROVED'|'REJECTED'|'EXPIRED', decidedAt: string, via: string }} decision
   * @returns {boolean} false if the approval was not pending
   */
  decide(id, { status, decidedAt, via }) {
    const result = this.#db.run(
      `UPDATE approvals SET status = ?, decided_at = ?, decided_via = ?
       WHERE id = ? AND status = 'PENDING'`,
      [status, decidedAt, via, id],
    );
    return Number(result.changes) === 1;
  }

  #toRow(row) {
    return {
      id: row.id,
      kind: row.kind,
      payload: JSON.parse(row.payload_json),
      sources: JSON.parse(row.sources_json),
      status: row.status,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
      decidedVia: row.decided_via,
    };
  }
}

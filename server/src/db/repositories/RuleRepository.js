/**
 * The user's per-rule settings (enabled, chosen actions) and the record of which rule ran on
 * which email (`rule_runs`, the History tab). Validation of settings lives in `RuleEngine`.
 */
export class RuleRepository {
  #db;

  /** @param {import('../Database.js').Database} db */
  constructor(db) {
    this.#db = db;
  }

  /**
   * Inserts rows for rules that have none yet, keeping the user's existing settings.
   * @param {{ id: string, name: string, actions: string[], isSecurity: boolean }[]} rules
   */
  seed(rules) {
    this.#db.transaction(() => {
      for (const rule of rules) {
        this.#db.run(
          `INSERT OR IGNORE INTO rules (id, name, enabled, actions_json, is_security)
           VALUES (?, ?, 1, ?, ?)`,
          [rule.id, rule.name, JSON.stringify(rule.actions), Number(rule.isSecurity)],
        );
      }
    });
  }

  /** @returns {{ id: string, name: string, enabled: boolean, actions: string[], isSecurity: boolean }[]} */
  list() {
    return this.#db.all('SELECT * FROM rules ORDER BY rowid').map((row) => this.#toRule(row));
  }

  get(id) {
    const row = this.#db.get('SELECT * FROM rules WHERE id = ?', [id]);
    return row && this.#toRule(row);
  }

  /**
   * @param {string} id
   * @param {{ enabled?: boolean, actions?: string[] }} changes
   */
  update(id, { enabled, actions }) {
    if (enabled !== undefined) {
      this.#db.run('UPDATE rules SET enabled = ? WHERE id = ?', [Number(enabled), id]);
    }
    if (actions !== undefined) {
      this.#db.run('UPDATE rules SET actions_json = ? WHERE id = ?', [JSON.stringify(actions), id]);
    }
  }

  /**
   * One row per (email, rule); re-running a rule on an email replaces its earlier row.
   * @param {{ gmailId: string, ruleId: string, actionsTaken: string[], status: string, at: Date }} run
   */
  recordRun({ gmailId, ruleId, actionsTaken, status, at }) {
    this.#db.run(
      `INSERT OR REPLACE INTO rule_runs (gmail_id, rule_id, actions_taken_json, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [gmailId, ruleId, JSON.stringify(actionsTaken), status, at.toISOString()],
    );
  }

  /** @returns {{ ruleId: string, actionsTaken: string[], status: string, createdAt: string }[]} */
  runsFor(gmailId) {
    return this.#db
      .all('SELECT * FROM rule_runs WHERE gmail_id = ? ORDER BY created_at', [gmailId])
      .map((row) => this.#toRun(row));
  }

  /**
   * The History tab (PRD F4.4): newest first, with the email's sender metadata and verdict.
   * @param {{ ruleId?: string, level?: string, limit?: number }} [filter]
   * @returns {{ gmailId: string, ruleId: string, actionsTaken: string[], status: string,
   *   createdAt: string, fromAddr: string, fromDomain: string, direction: string, date: string,
   *   level: string | null }[]}
   */
  history({ ruleId, level, limit = 100 } = {}) {
    const where = [];
    const params = [];
    if (ruleId) {
      where.push('r.rule_id = ?');
      params.push(ruleId);
    }
    if (level) {
      where.push('v.level = ?');
      params.push(level);
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    return this.#db
      .all(
        `SELECT r.*, e.from_addr, e.from_domain, e.direction, e.date, v.level
         FROM rule_runs r
         JOIN emails e ON e.gmail_id = r.gmail_id
         LEFT JOIN verdicts v ON v.gmail_id = r.gmail_id
         ${clause}
         ORDER BY r.created_at DESC, e.date DESC, r.rule_id LIMIT ?`,
        [...params, limit],
      )
      .map((row) => ({
        gmailId: row.gmail_id,
        ...this.#toRun(row),
        fromAddr: row.from_addr,
        fromDomain: row.from_domain,
        direction: row.direction,
        date: row.date,
        level: row.level ?? null,
      }));
  }

  #toRule(row) {
    return {
      id: row.id,
      name: row.name,
      enabled: row.enabled === 1,
      actions: JSON.parse(row.actions_json),
      isSecurity: row.is_security === 1,
    };
  }

  #toRun(row) {
    return {
      ruleId: row.rule_id,
      actionsTaken: JSON.parse(row.actions_taken_json),
      status: row.status,
      createdAt: row.created_at,
    };
  }
}

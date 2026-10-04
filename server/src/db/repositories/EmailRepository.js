import { ValidationError } from '../../core/errors.js';

const MAX_ATTEMPTS = 5;

/**
 * @typedef {import('../../sync/EmailMetadataMapper.js').EmailRecord & {
 *   rules: string[], category: string | null, summary: string | null, needsReply: boolean,
 *   verdict: { level: string, score: number, injectionAttempt: boolean, userFeedback: string | null } | null,
 * }} InboxItem one Inbox row: metadata, subject, snippet, matched rules, the Reader's typed
 *   fields and the verdict. Only the UI list routes receive this shape.
 */

/**
 * Stored email metadata (never bodies) and the queue of new mail awaiting the security pipeline.
 *
 * The subject and snippet are untrusted text kept for the inbox list. They are returned only by
 * the list methods (`page`, `listByIds`, `listThreadsFrom`); `get`, `search` and the other record methods feed the
 * agent and the rules and never include them, so the Planner cannot receive them (invariant 2).
 */
export class EmailRepository {
  #db;

  /** @param {import('../Database.js').Database} db */
  constructor(db) {
    this.#db = db;
  }

  /**
   * Stores the record unless it already exists.
   * @param {import('../../sync/EmailMetadataMapper.js').EmailRecord} record
   * @param {{ pending: boolean }} options pending = must go through the security pipeline
   * @returns {boolean} true if it was new
   */
  insertIfAbsent(record, { pending }) {
    const result = this.#db.run(
      `INSERT OR IGNORE INTO emails (gmail_id, thread_id, direction, from_addr, from_domain,
         from_name, to_addrs, date, subject_hash, subject, snippet, has_list_unsubscribe,
         unsubscribe_url, one_click, labels, is_read, pending)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.gmailId,
        record.threadId,
        record.direction,
        record.fromAddr,
        record.fromDomain,
        record.fromName,
        JSON.stringify(record.toAddrs),
        record.date,
        record.subjectHash,
        record.subject ?? null,
        record.snippet ?? null,
        Number(record.hasListUnsubscribe),
        record.unsubscribeUrl,
        Number(record.oneClick),
        JSON.stringify(record.labels),
        Number(record.isRead),
        Number(pending),
      ],
    );
    return Number(result.changes) === 1;
  }

  /**
   * Mailmoat's own visible-text snippet, written whenever the message is ingested; it replaces
   * Gmail's snippet from the metadata fetch.
   * @param {string} gmailId @param {string} snippet
   */
  setSnippet(gmailId, snippet) {
    this.#db.run('UPDATE emails SET snippet = ? WHERE gmail_id = ?', [snippet, gmailId]);
  }

  /**
   * Fills a row stored before subjects were kept. An ingested snippet is never overwritten.
   * @param {string} gmailId @param {{ subject: string, snippet: string }} text
   */
  setText(gmailId, { subject, snippet }) {
    this.#db.run(
      'UPDATE emails SET subject = ?, snippet = COALESCE(snippet, ?) WHERE gmail_id = ?',
      [subject, snippet, gmailId],
    );
  }

  /**
   * Rows whose subject was never fetched (NULL; an email without a subject stores ''), newest
   * first, so the next sync pass can fill them.
   * @returns {string[]} Gmail ids
   */
  listMissingText(limit = 200) {
    return this.#db
      .all('SELECT gmail_id FROM emails WHERE subject IS NULL ORDER BY date DESC LIMIT ?', [limit])
      .map((row) => row.gmail_id);
  }

  /** @param {string} gmailId */
  has(gmailId) {
    return Boolean(this.#db.get('SELECT 1 AS found FROM emails WHERE gmail_id = ?', [gmailId]));
  }

  /** @returns {import('../../sync/EmailMetadataMapper.js').EmailRecord | undefined} */
  get(gmailId) {
    const row = this.#db.get('SELECT * FROM emails WHERE gmail_id = ?', [gmailId]);
    return row && this.#toRecord(row);
  }

  /**
   * Metadata search for the agent's `search_emails` tool, newest first.
   * @param {{ from?: string, direction?: 'inbound'|'outbound', since?: string, until?: string, limit?: number }} filter
   *   `from` matches the address or the domain; `since`/`until` are ISO times
   * @returns {import('../../sync/EmailMetadataMapper.js').EmailRecord[]}
   */
  search({ from, direction, since, until, limit = 200 } = {}) {
    const where = [];
    const params = [];
    if (from) {
      where.push('(from_addr = ? OR from_domain = ?)');
      params.push(from.toLowerCase(), from.toLowerCase());
    }
    if (direction) {
      where.push('direction = ?');
      params.push(direction);
    }
    if (since) {
      where.push('date >= ?');
      params.push(since);
    }
    if (until) {
      where.push('date <= ?');
      params.push(until);
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    return this.#db
      .all(`SELECT * FROM emails ${clause} ORDER BY date DESC LIMIT ?`, [...params, limit])
      .map((row) => this.#toRecord(row));
  }

  /**
   * The newest message in a thread (the rules "To Reply" / "Awaiting Reply" need to know whether
   * the user or the other party spoke last).
   * @returns {import('../../sync/EmailMetadataMapper.js').EmailRecord | undefined}
   */
  latestInThread(threadId) {
    const row = this.#db.get(
      'SELECT * FROM emails WHERE thread_id = ? ORDER BY date DESC, gmail_id DESC LIMIT 1',
      [threadId],
    );
    return row && this.#toRecord(row);
  }

  /**
   * Mail the pipeline has already handled, oldest first, for "Process past emails" (PRD F4.5).
   * @param {string} since ISO time
   * @returns {import('../../sync/EmailMetadataMapper.js').EmailRecord[]}
   */
  listProcessedSince(since) {
    return this.#db
      .all('SELECT * FROM emails WHERE pending = 0 AND date >= ? ORDER BY date ASC', [since])
      .map((row) => this.#toRecord(row));
  }

  /** New mail still waiting for the pipeline, oldest first; gives up after 5 failed attempts. */
  listPending(limit = 50) {
    return this.#db
      .all('SELECT * FROM emails WHERE pending = 1 AND attempts < ? ORDER BY date ASC LIMIT ?', [
        MAX_ATTEMPTS,
        limit,
      ])
      .map((row) => this.#toRecord(row));
  }

  /** @param {string} gmailId @param {Date} at */
  markProcessed(gmailId, at) {
    this.#db.run('UPDATE emails SET pending = 0, processed_at = ? WHERE gmail_id = ?', [
      at.toISOString(),
      gmailId,
    ]);
  }

  /** Records a failed pipeline run so the email is retried on the next poll. */
  recordFailedAttempt(gmailId) {
    this.#db.run('UPDATE emails SET attempts = attempts + 1 WHERE gmail_id = ?', [gmailId]);
  }

  count() {
    return this.#db.get('SELECT COUNT(*) AS n FROM emails').n;
  }

  /**
   * The Inbox list (PRD F5): newest first, keyset-paginated, with the verdict and the Reader's
   * typed fields. `ruleId` is a tab: an email is in it when that rule ran on it (so "Awaiting
   * Reply" lists the user's own mail). Without a tab, inbound mail only.
   * @param {{ ruleId?: string, level?: string, cursor?: string, limit?: number }} [filter]
   * @returns {{ items: InboxItem[], nextCursor: string | null }}
   * @throws {ValidationError} for a malformed cursor
   */
  page({ ruleId, level, cursor, limit = 50 } = {}) {
    const where = [];
    const params = [];
    if (ruleId) {
      where.push(
        'EXISTS (SELECT 1 FROM rule_runs r WHERE r.gmail_id = e.gmail_id AND r.rule_id = ?)',
      );
      params.push(ruleId);
    } else {
      where.push("e.direction = 'inbound'");
    }
    if (level) {
      where.push('v.level = ?');
      params.push(level);
    }
    if (cursor) {
      const { date, gmailId } = EmailRepository.#decodeCursor(cursor);
      where.push('(e.date < ? OR (e.date = ? AND e.gmail_id < ?))');
      params.push(date, date, gmailId);
    }
    const rows = this.#listRows(where, params, limit + 1);
    const items = rows.slice(0, limit).map((row) => this.#toItem(row));
    const last = items.at(-1);
    const nextCursor =
      rows.length > limit ? EmailRepository.#encodeCursor(last.date, last.gmailId) : null;
    return { items, nextCursor };
  }

  /**
   * Unread counts for the tab bar (F5.1): per rule, per risk level, and all inbound mail.
   * @returns {{ all: number, byRule: Record<string, number>, byLevel: Record<string, number> }}
   */
  unreadCounts() {
    const all = this.#db.get(
      "SELECT COUNT(*) AS n FROM emails WHERE direction = 'inbound' AND is_read = 0",
    ).n;
    const byRule = {};
    for (const row of this.#db.all(
      `SELECT r.rule_id, COUNT(*) AS n FROM rule_runs r
       JOIN emails e ON e.gmail_id = r.gmail_id
       WHERE e.is_read = 0 AND r.status = 'done' GROUP BY r.rule_id`,
    )) {
      byRule[row.rule_id] = row.n;
    }
    const byLevel = {};
    for (const row of this.#db.all(
      `SELECT v.level, COUNT(*) AS n FROM verdicts v
       JOIN emails e ON e.gmail_id = v.gmail_id
       WHERE e.is_read = 0 GROUP BY v.level`,
    )) {
      byLevel[row.level] = row.n;
    }
    return { all, byRule, byLevel };
  }

  /**
   * Inbox rows for the given Gmail ids (live search results), in no particular order; ids that
   * are not stored are left out.
   * @param {string[]} gmailIds
   * @returns {InboxItem[]}
   */
  listByIds(gmailIds) {
    if (gmailIds.length === 0) return [];
    const marks = gmailIds.map(() => '?').join(', ');
    return this.#listRows([`e.gmail_id IN (${marks})`], gmailIds, gmailIds.length).map((row) =>
      this.#toItem(row),
    );
  }

  /**
   * The sender card (PLAN §13.6): the newest message of each thread this address wrote to,
   * newest thread first. A list shape for the UI only, never the agent.
   * @param {string} address
   * @param {number} [limit]
   * @returns {InboxItem[]}
   */
  listThreadsFrom(address, limit = 5) {
    // SQLite's bare-column rule: with one MAX() the other columns come from that same row.
    return this.#listRows(
      [
        `e.gmail_id IN (SELECT gmail_id FROM (
           SELECT x.gmail_id, MAX(x.date) FROM emails x WHERE x.from_addr = ? GROUP BY x.thread_id))`,
      ],
      [address.toLowerCase()],
      limit,
    ).map((row) => this.#toItem(row));
  }

  #listRows(where, params, limit) {
    return this.#db.all(
      `SELECT e.*, v.level, v.score, v.injection_attempt, v.user_feedback,
              json_extract(rf.json, '$.category') AS category,
              json_extract(rf.json, '$.summary') AS summary,
              json_extract(rf.json, '$.needs_reply') AS needs_reply,
              (SELECT json_group_array(r.rule_id) FROM rule_runs r
                WHERE r.gmail_id = e.gmail_id AND r.status = 'done') AS rule_ids
       FROM emails e
       LEFT JOIN verdicts v ON v.gmail_id = e.gmail_id
       LEFT JOIN reader_forms rf ON rf.gmail_id = e.gmail_id
       WHERE ${where.join(' AND ')}
       ORDER BY e.date DESC, e.gmail_id DESC
       LIMIT ?`,
      [...params, limit],
    );
  }

  #toItem(row) {
    return {
      ...this.#toRecord(row),
      subject: row.subject ?? '',
      snippet: row.snippet ?? '',
      rules: JSON.parse(row.rule_ids),
      category: row.category,
      summary: row.summary,
      needsReply: row.needs_reply === 1,
      verdict:
        row.level === null
          ? null
          : {
              level: row.level,
              score: row.score,
              injectionAttempt: row.injection_attempt === 1,
              userFeedback: row.user_feedback,
            },
    };
  }

  static #encodeCursor(date, gmailId) {
    return Buffer.from(JSON.stringify({ date, gmailId })).toString('base64url');
  }

  static #decodeCursor(cursor) {
    try {
      const { date, gmailId } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (typeof date !== 'string' || typeof gmailId !== 'string') throw new Error('shape');
      return { date, gmailId };
    } catch {
      throw new ValidationError('Invalid cursor');
    }
  }

  // Deliberately without subject and snippet: records flow into the agent (see the class note).
  #toRecord(row) {
    return {
      gmailId: row.gmail_id,
      threadId: row.thread_id,
      direction: row.direction,
      fromAddr: row.from_addr,
      fromDomain: row.from_domain,
      fromName: row.from_name,
      toAddrs: JSON.parse(row.to_addrs),
      date: row.date,
      subjectHash: row.subject_hash,
      hasListUnsubscribe: row.has_list_unsubscribe === 1,
      unsubscribeUrl: row.unsubscribe_url,
      oneClick: row.one_click === 1,
      labels: JSON.parse(row.labels),
      isRead: row.is_read === 1,
    };
  }
}

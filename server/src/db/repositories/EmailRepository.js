const MAX_ATTEMPTS = 5;

/**
 * Stored email metadata (never bodies) and the queue of new mail awaiting the security pipeline.
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
         from_name, to_addrs, date, subject_hash, has_list_unsubscribe, unsubscribe_url,
         one_click, labels, is_read, pending)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

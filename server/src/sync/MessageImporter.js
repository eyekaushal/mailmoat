/**
 * Fetches metadata for Gmail message IDs and stores each message exactly once.
 * Shared by live sync (new mail, queued for the pipeline) and backfill (history only).
 */
export class MessageImporter {
  #gmail;
  #emails;
  #history;
  #mapper;
  #logger;
  #concurrency;

  /**
   * @param {object} deps
   * @param {Pick<import('../google/GmailClient.js').GmailClient, 'getMessageMetadata'>} deps.gmail
   * @param {import('../db/repositories/EmailRepository.js').EmailRepository} deps.emails
   * @param {import('./ContactHistoryBuilder.js').ContactHistoryBuilder} deps.history
   * @param {import('./EmailMetadataMapper.js').EmailMetadataMapper} deps.mapper
   * @param {import('../core/Logger.js').Logger} deps.logger
   * @param {number} [deps.concurrency] parallel Gmail requests (Gmail quota ≈ 50 metadata reads/s)
   */
  constructor({ gmail, emails, history, mapper, logger, concurrency = 10 }) {
    this.#gmail = gmail;
    this.#emails = emails;
    this.#history = history;
    this.#mapper = mapper;
    this.#logger = logger;
    this.#concurrency = concurrency;
  }

  /**
   * @param {string[]} ids
   * @param {{ pending: boolean, before?: Date }} options
   *   pending: queue new messages for the security pipeline;
   *   before: ignore messages received at or after this time (left for live sync)
   * @returns {Promise<number>} how many messages were newly stored
   */
  async import(ids, { pending, before }) {
    const fresh = ids.filter((id) => !this.#emails.has(id));
    let stored = 0;
    for (let i = 0; i < fresh.length; i += this.#concurrency) {
      const batch = fresh.slice(i, i + this.#concurrency);
      const results = await Promise.all(batch.map((id) => this.#importOne(id, pending, before)));
      stored += results.filter(Boolean).length;
    }
    return stored;
  }

  async #importOne(id, pending, before) {
    let metadata;
    try {
      metadata = await this.#gmail.getMessageMetadata(id);
    } catch (error) {
      // Deleted between listing and fetching — nothing to import.
      if (error?.code === 404 || error?.status === 404) return false;
      throw error;
    }
    if (this.#mapper.shouldSkip(metadata)) return false;
    if (before && metadata.internalDate >= before) return false;

    const record = this.#mapper.toRecord(metadata);
    if (!this.#emails.insertIfAbsent(record, { pending })) return false;
    this.#history.record(record);
    this.#logger.debug('stored email', { gmailId: id, direction: record.direction, pending });
    return true;
  }
}

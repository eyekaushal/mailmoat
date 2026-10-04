import { HistoryExpiredError } from '../core/errors.js';

const RECOVERY_QUERY = 'newer_than:7d -in:spam -in:trash -in:chats';

/**
 * Finds new Gmail messages by polling the History API and hands each one to the processor
 * (the security pipeline). No public URL is needed, which suits a local-first app.
 *
 * Crash-safe: new messages are stored as `pending` before the history ID advances, and only
 * marked processed after the processor succeeds, so nothing is lost or handled twice.
 */
export class GmailSync {
  #gmail;
  #importer;
  #emails;
  #syncState;
  #processor;
  #logger;
  #now;

  /**
   * @param {object} deps
   * @param {Pick<import('../google/GmailClient.js').GmailClient, 'getProfile'|'listHistory'|'listMessageIds'>} deps.gmail
   * @param {import('./MessageImporter.js').MessageImporter} deps.importer
   * @param {import('../db/repositories/EmailRepository.js').EmailRepository} deps.emails
   * @param {import('../db/repositories/SyncStateRepository.js').SyncStateRepository} deps.syncState
   * @param {{ process(record: import('./EmailMetadataMapper.js').EmailRecord): Promise<void> }} deps.processor
   * @param {import('../core/Logger.js').Logger} deps.logger
   * @param {() => Date} [deps.now]
   */
  constructor({ gmail, importer, emails, syncState, processor, logger, now = () => new Date() }) {
    this.#gmail = gmail;
    this.#importer = importer;
    this.#emails = emails;
    this.#syncState = syncState;
    this.#processor = processor;
    this.#logger = logger;
    this.#now = now;
  }

  /**
   * On first run, remembers Gmail's current history ID so only mail arriving from now on is
   * treated as new. Older mail is the Backfill's job.
   * @returns {Promise<{ firstRun: boolean, startedAt: Date }>}
   */
  async initialize() {
    const startedAt = this.#now();
    if (this.#syncState.getHistoryId()) return { firstRun: false, startedAt };
    const { historyId } = await this.#gmail.getProfile();
    this.#syncState.setHistoryId(historyId);
    return { firstRun: true, startedAt };
  }

  /** @returns {Promise<{ newMessages: number, processed: number, failed: number }>} */
  async poll() {
    const startHistoryId = this.#syncState.getHistoryId();
    if (!startHistoryId) {
      await this.initialize();
      return { newMessages: 0, ...(await this.#processPending()) };
    }

    let newMessages;
    try {
      newMessages = await this.#ingestHistory(startHistoryId);
    } catch (error) {
      if (!(error instanceof HistoryExpiredError)) throw error;
      newMessages = await this.#recoverFromExpiredHistory();
    }
    const result = { newMessages, ...(await this.#processPending()) };
    await this.#importer.fillText();
    this.#syncState.markPolled(this.#now());
    if (newMessages > 0 || result.failed > 0) this.#logger.info('sync poll', result);
    return result;
  }

  async #ingestHistory(startHistoryId) {
    let pageToken;
    let latestHistoryId = startHistoryId;
    let stored = 0;
    do {
      const page = await this.#gmail.listHistory(startHistoryId, pageToken);
      stored += await this.#importer.import(page.messageIds, { pending: true });
      latestHistoryId = page.historyId ?? latestHistoryId;
      pageToken = page.nextPageToken;
    } while (pageToken);
    this.#syncState.setHistoryId(latestHistoryId);
    return stored;
  }

  /** Gmail dropped our history position (e.g. the app was off for a long time): rescan a week. */
  async #recoverFromExpiredHistory() {
    this.#logger.warn('Gmail history expired; rescanning the last 7 days');
    const { historyId } = await this.#gmail.getProfile();
    let pageToken;
    let stored = 0;
    do {
      const page = await this.#gmail.listMessageIds({ query: RECOVERY_QUERY, pageToken });
      stored += await this.#importer.import(page.ids, { pending: true });
      pageToken = page.nextPageToken;
    } while (pageToken);
    this.#syncState.setHistoryId(historyId);
    return stored;
  }

  async #processPending() {
    let processed = 0;
    let failed = 0;
    for (const record of this.#emails.listPending()) {
      try {
        await this.#processor.process(record);
        this.#emails.markProcessed(record.gmailId, this.#now());
        processed += 1;
      } catch (error) {
        this.#emails.recordFailedAttempt(record.gmailId);
        this.#logger.error('pipeline failed; will retry', { gmailId: record.gmailId, error });
        failed += 1;
      }
    }
    return { processed, failed };
  }
}

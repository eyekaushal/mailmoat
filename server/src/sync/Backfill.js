/**
 * First-run import of past mail metadata so signals have history to compare against.
 * Sent mail goes back further than received mail because "the user wrote to this address"
 * is the strongest evidence of a real contact. Backfilled mail is not run through the
 * pipeline (that would cost an LLM call per old email).
 */
export class Backfill {
  #gmail;
  #importer;
  #logger;

  /**
   * @param {object} deps
   * @param {Pick<import('../google/GmailClient.js').GmailClient, 'listMessageIds'>} deps.gmail
   * @param {import('./MessageImporter.js').MessageImporter} deps.importer
   * @param {import('../core/Logger.js').Logger} deps.logger
   */
  constructor({ gmail, importer, logger }) {
    this.#gmail = gmail;
    this.#importer = importer;
    this.#logger = logger;
  }

  /**
   * @param {{ before: Date, receivedDays?: number, sentDays?: number,
   *   onProgress?: (progress: { phase: string, stored: number }) => void }} options
   *   before: when live sync started; newer mail belongs to live sync
   * @returns {Promise<{ sent: number, received: number }>}
   */
  async run({ before, receivedDays = 30, sentDays = 365, onProgress = () => {} }) {
    const sent = await this.#importQuery(
      `in:sent newer_than:${sentDays}d`,
      'sent',
      before,
      onProgress,
    );
    const received = await this.#importQuery(
      `newer_than:${receivedDays}d -in:sent -in:spam -in:trash -in:chats`,
      'received',
      before,
      onProgress,
    );
    this.#logger.info('backfill complete', { sent, received });
    return { sent, received };
  }

  async #importQuery(query, phase, before, onProgress) {
    let pageToken;
    let stored = 0;
    do {
      const page = await this.#gmail.listMessageIds({ query, pageToken, maxResults: 500 });
      stored += await this.#importer.import(page.ids, { pending: false, before });
      onProgress({ phase, stored });
      pageToken = page.nextPageToken;
    } while (pageToken);
    return stored;
  }
}

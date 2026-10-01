import { createHash } from 'node:crypto';

// Hidden evidence is kept for signals and the audit log; this bounds what one email can store.
const MAX_HIDDEN_ITEM_CHARS = 1_000;

/**
 * @typedef {object} IngestedEmail
 * @property {{ key: string, value: string }[]} headers
 * @property {import('./MimeParser.js').Mailbox | null} from display name normalised
 * @property {import('./MimeParser.js').Mailbox[]} replyTo
 * @property {import('./MimeParser.js').Mailbox[]} to
 * @property {import('./MimeParser.js').Mailbox[]} cc
 * @property {string} subject normalised
 * @property {string | null} messageId
 * @property {import('./AuthResultsParser.js').AuthResults} auth
 * @property {import('./LinkExtractor.js').Link[]} links
 * @property {import('./MimeParser.js').AttachmentInfo[]} attachments
 * @property {string} html raw HTML part, for structural checks only; never shown to an AI
 * @property {import('./HiddenContentDetector.js').HiddenItem[]} hidden normalised and capped
 * @property {string} readerText visible text only, normalised and capped
 * @property {boolean} readerTextTruncated
 * @property {string} bodyHash SHA-256 of the raw message
 */

/** Layer 1: turns a raw Gmail message into the facts every later layer works from. */
export class EmailIngestor {
  #mimeParser;
  #authResultsParser;
  #linkExtractor;
  #hiddenContentDetector;
  #textNormalizer;

  /**
   * @param {{
   *   mimeParser: import('./MimeParser.js').MimeParser,
   *   authResultsParser: import('./AuthResultsParser.js').AuthResultsParser,
   *   linkExtractor: import('./LinkExtractor.js').LinkExtractor,
   *   hiddenContentDetector: import('./HiddenContentDetector.js').HiddenContentDetector,
   *   textNormalizer: import('./TextNormalizer.js').TextNormalizer,
   * }} deps
   */
  constructor({
    mimeParser,
    authResultsParser,
    linkExtractor,
    hiddenContentDetector,
    textNormalizer,
  }) {
    this.#mimeParser = mimeParser;
    this.#authResultsParser = authResultsParser;
    this.#linkExtractor = linkExtractor;
    this.#hiddenContentDetector = hiddenContentDetector;
    this.#textNormalizer = textNormalizer;
  }

  /**
   * @param {Buffer} raw RFC 822 message
   * @returns {Promise<IngestedEmail>}
   * @throws {import('../../core/errors.js').IngestError}
   */
  async ingest(raw) {
    const email = await this.#mimeParser.parse(raw);
    const { visibleText, hidden } = this.#hiddenContentDetector.detect({
      html: email.html,
      text: email.text,
      subject: email.subject,
      fromName: email.from?.name ?? null,
    });
    const reader = this.#textNormalizer.forReader(visibleText);

    return {
      headers: email.headers,
      from: email.from && { ...email.from, name: this.#normalizeOrNull(email.from.name) },
      replyTo: email.replyTo,
      to: email.to,
      cc: email.cc,
      subject: this.#textNormalizer.normalize(email.subject),
      messageId: email.messageId,
      auth: this.#authResultsParser.parse(email.headers),
      links: this.#linkExtractor.extract({ html: email.html, text: email.text }),
      attachments: email.attachments,
      html: email.html,
      hidden: hidden.map((item) => ({
        technique: item.technique,
        text: this.#textNormalizer.normalize(item.text).slice(0, MAX_HIDDEN_ITEM_CHARS),
      })),
      readerText: reader.text,
      readerTextTruncated: reader.truncated,
      bodyHash: createHash('sha256').update(raw).digest('hex'),
    };
  }

  #normalizeOrNull(text) {
    return text ? this.#textNormalizer.normalize(text) || null : null;
  }
}

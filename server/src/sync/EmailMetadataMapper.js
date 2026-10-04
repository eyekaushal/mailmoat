import { createHash } from 'node:crypto';
import { addressParser } from 'postal-mime';

const SKIPPED_LABELS = new Set(['SPAM', 'TRASH', 'DRAFT', 'CHAT']);
const MAX_SUBJECT_CHARS = 300;
// Gmail's snippet field is HTML-escaped; these are the entities it produces.
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * @typedef {object} EmailRecord
 * @property {string} gmailId
 * @property {string} threadId
 * @property {'inbound'|'outbound'} direction
 * @property {string} fromAddr lower-cased
 * @property {string} fromDomain
 * @property {string | null} fromName display name (attacker-controlled for inbound mail)
 * @property {string[]} toAddrs lower-cased To + Cc
 * @property {Record<string, string>} recipientNames To/Cc address → display name, where given
 * @property {string} date ISO time Gmail received the message
 * @property {string | null} subjectHash
 * @property {string} subject normalised, for the inbox list only ('' when there is none)
 * @property {string} snippet ≤ 160 chars of plain text for the inbox list only; Gmail's until
 *   the message has been ingested, then mailmoat's own visible-text snippet
 * @property {boolean} hasListUnsubscribe
 * @property {string | null} unsubscribeUrl
 * @property {boolean} oneClick RFC 8058 one-click unsubscribe available
 * @property {string[]} labels
 * @property {boolean} isRead
 */

/**
 * Turns Gmail message metadata into the record mailmoat stores. The date comes from Gmail's
 * receive time rather than the sender-controlled Date header; the subject and snippet are
 * normalised (zero-width and bidi characters stripped) because the inbox list shows them.
 */
export class EmailMetadataMapper {
  #textNormalizer;

  /** @param {{ textNormalizer: import('../security/ingest/TextNormalizer.js').TextNormalizer }} deps */
  constructor({ textNormalizer }) {
    this.#textNormalizer = textNormalizer;
  }

  /** @returns {boolean} whether mailmoat should ignore this message entirely */
  shouldSkip(metadata) {
    return metadata.labelIds.some((label) => SKIPPED_LABELS.has(label));
  }

  /**
   * @param {Awaited<ReturnType<import('../google/GmailClient.js').GmailClient['getMessageMetadata']>>} metadata
   * @returns {EmailRecord}
   */
  toRecord(metadata) {
    const { headers, labelIds } = metadata;
    const [from] = this.#parseAddresses(headers.from);
    const recipients = [...this.#parseAddresses(headers.to), ...this.#parseAddresses(headers.cc)];
    const fromAddr = from?.address ?? '';
    const listUnsubscribe = headers['list-unsubscribe'] ?? '';
    const unsubscribeUrl = this.#unsubscribeUrl(listUnsubscribe);

    return {
      gmailId: metadata.id,
      threadId: metadata.threadId,
      direction: labelIds.includes('SENT') ? 'outbound' : 'inbound',
      fromAddr,
      fromDomain: fromAddr.split('@').pop() ?? '',
      fromName: from?.name || null,
      toAddrs: recipients.map((entry) => entry.address),
      recipientNames: Object.fromEntries(
        recipients.filter((entry) => entry.name).map((entry) => [entry.address, entry.name]),
      ),
      date: metadata.internalDate.toISOString(),
      subjectHash: headers.subject
        ? createHash('sha256').update(headers.subject).digest('hex')
        : null,
      ...this.toText(metadata),
      hasListUnsubscribe: listUnsubscribe.length > 0,
      unsubscribeUrl,
      oneClick:
        Boolean(unsubscribeUrl?.startsWith('https://')) &&
        /List-Unsubscribe=One-Click/i.test(headers['list-unsubscribe-post'] ?? ''),
      labels: labelIds,
      isRead: !labelIds.includes('UNREAD'),
    };
  }

  /**
   * The two display strings, for new rows and for filling rows stored before they existed.
   * @param {{ headers: Record<string, string>, snippet?: string }} metadata
   * @returns {{ subject: string, snippet: string }}
   */
  toText({ headers, snippet }) {
    return {
      subject: this.#textNormalizer.normalize(headers.subject ?? '').slice(0, MAX_SUBJECT_CHARS),
      snippet: this.#textNormalizer.snippet(this.#decodeEntities(snippet ?? '')),
    };
  }

  #decodeEntities(text) {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] !== '#') return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
      const code =
        entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
  }

  #parseAddresses(header) {
    if (!header) return [];
    return addressParser(header)
      .flatMap((entry) => (entry.group ? entry.group : [entry]))
      .filter((entry) => entry.address?.includes('@'))
      .map((entry) => ({ address: entry.address.toLowerCase(), name: entry.name }));
  }

  /** Prefers an https link; falls back to mailto. Other schemes are ignored. */
  #unsubscribeUrl(header) {
    const candidates = [...header.matchAll(/<([^>]+)>/g)].map((match) => match[1].trim());
    return (
      candidates.find((url) => url.startsWith('https://')) ??
      candidates.find((url) => url.toLowerCase().startsWith('mailto:')) ??
      null
    );
  }
}

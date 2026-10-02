import { createHash } from 'node:crypto';
import { addressParser } from 'postal-mime';

const SKIPPED_LABELS = new Set(['SPAM', 'TRASH', 'DRAFT', 'CHAT']);

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
 * @property {boolean} hasListUnsubscribe
 * @property {string | null} unsubscribeUrl
 * @property {boolean} oneClick RFC 8058 one-click unsubscribe available
 * @property {string[]} labels
 * @property {boolean} isRead
 */

/**
 * Turns Gmail message metadata into the record mailmoat stores. The subject is kept only as a
 * hash, and the date comes from Gmail's receive time rather than the sender-controlled Date header.
 */
export class EmailMetadataMapper {
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
      hasListUnsubscribe: listUnsubscribe.length > 0,
      unsubscribeUrl,
      oneClick:
        Boolean(unsubscribeUrl?.startsWith('https://')) &&
        /List-Unsubscribe=One-Click/i.test(headers['list-unsubscribe-post'] ?? ''),
      labels: labelIds,
      isRead: !labelIds.includes('UNREAD'),
    };
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

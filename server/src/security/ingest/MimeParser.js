import PostalMime from 'postal-mime';
import { IngestError } from '../../core/errors.js';

/**
 * @typedef {object} Mailbox
 * @property {string} address lower-cased
 * @property {string | null} name display name (attacker-controlled)
 */

/**
 * @typedef {object} AttachmentInfo
 * @property {string | null} filename attacker-controlled
 * @property {string} mimeType declared type, lower-cased (attacker-controlled)
 * @property {string | null} disposition
 * @property {number} size decoded bytes
 * @property {boolean} inline referenced from the HTML by Content-ID
 * @property {boolean} encrypted a password-protected ZIP (malware hides from scanners this way)
 */

/**
 * @typedef {object} ParsedEmail
 * @property {{ key: string, value: string }[]} headers every header in document order (top first), key lower-cased
 * @property {Mailbox | null} from
 * @property {Mailbox[]} replyTo
 * @property {Mailbox[]} to
 * @property {Mailbox[]} cc
 * @property {string} subject
 * @property {string | null} messageId
 * @property {string} text plain-text part ('' if none)
 * @property {string} html HTML part ('' if none)
 * @property {AttachmentInfo[]} attachments metadata only; content is not kept
 */

/** Parses a raw RFC 822 message (Gmail `format=raw`) into a {@link ParsedEmail}. */
export class MimeParser {
  /**
   * @param {Buffer} raw
   * @returns {Promise<ParsedEmail>}
   * @throws {IngestError} when the message cannot be parsed
   */
  async parse(raw) {
    let email;
    try {
      email = await PostalMime.parse(raw);
    } catch (error) {
      throw new IngestError('Could not parse MIME message', { cause: error });
    }

    return {
      headers: email.headers.map(({ key, value }) => ({ key, value })),
      from: this.#mailboxes(email.from ? [email.from] : [])[0] ?? null,
      replyTo: this.#mailboxes(email.replyTo),
      to: this.#mailboxes(email.to),
      cc: this.#mailboxes(email.cc),
      subject: email.subject ?? '',
      messageId: email.messageId ?? null,
      text: email.text ?? '',
      html: email.html ?? '',
      attachments: email.attachments.map((attachment) => ({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        disposition: attachment.disposition,
        size: attachment.content.byteLength,
        inline: Boolean(attachment.related),
        encrypted:
          this.#isZip(attachment) && this.#isEncryptedZip(new Uint8Array(attachment.content)),
      })),
    };
  }

  /** Only ZIPs are scanned: random bytes inside a PDF or image could look like a ZIP header. */
  #isZip(attachment) {
    return /\.zip$/i.test(attachment.filename ?? '') || /zip/.test(attachment.mimeType);
  }

  /**
   * Checks every ZIP local file header (`PK\x03\x04`) for the "encrypted" flag (bit 0 at offset 6).
   * Scanning all headers matters: the first entry may be an unencrypted decoy.
   */
  #isEncryptedZip(bytes) {
    for (let i = 0; i + 7 < bytes.length; i += 1) {
      const isHeader =
        bytes[i] === 0x50 &&
        bytes[i + 1] === 0x4b &&
        bytes[i + 2] === 0x03 &&
        bytes[i + 3] === 0x04;
      if (isHeader && (bytes[i + 6] & 1) === 1) return true;
    }
    return false;
  }

  /** Flattens address groups and drops entries without a usable address. */
  #mailboxes(addresses = []) {
    return addresses
      .flatMap((entry) => (entry.group ? entry.group : [entry]))
      .filter((entry) => entry.address?.includes('@'))
      .map((entry) => ({ address: entry.address.toLowerCase(), name: entry.name || null }));
  }
}

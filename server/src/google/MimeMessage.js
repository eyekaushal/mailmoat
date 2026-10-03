const HEADER_FORBIDDEN = /[\r\n]/;

/**
 * Builds a plain-text RFC 5322 message for Gmail drafts and sends. Gmail fills in `From`.
 * Header values are rejected if they contain line breaks, so no argument can inject headers.
 */
export class MimeMessage {
  /**
   * @param {{
   *   to: string[], cc?: string[], subject: string, body: string,
   *   inReplyTo?: string | null, date?: Date,
   * }} message
   * @returns {Buffer}
   */
  static build({ to, cc = [], subject, body, inReplyTo = null, date = new Date() }) {
    if (to.length === 0) throw new RangeError('A message needs at least one recipient');
    const headers = [
      ['To', to.map(MimeMessage.#address).join(', ')],
      cc.length > 0 ? ['Cc', cc.map(MimeMessage.#address).join(', ')] : null,
      ['Subject', MimeMessage.#encodeHeader(subject)],
      inReplyTo ? ['In-Reply-To', MimeMessage.#plain(inReplyTo)] : null,
      inReplyTo ? ['References', MimeMessage.#plain(inReplyTo)] : null,
      ['Date', date.toUTCString()],
      ['MIME-Version', '1.0'],
      ['Content-Type', 'text/plain; charset="UTF-8"'],
      ['Content-Transfer-Encoding', 'base64'],
    ]
      .filter(Boolean)
      .map(([name, value]) => `${name}: ${value}`);
    // Base64 keeps the body byte-exact and immune to line-length and bare-CR issues.
    const encoded = Buffer.from(body, 'utf8')
      .toString('base64')
      .replace(/(.{76})/g, '$1\r\n');
    return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${encoded}\r\n`, 'utf8');
  }

  static #plain(value) {
    if (HEADER_FORBIDDEN.test(value)) throw new RangeError('Header value contains a line break');
    return value;
  }

  static #address(address) {
    const value = MimeMessage.#plain(address);
    if (!/^[^\s<>,;"]+@[^\s<>,;"]+$/.test(value)) throw new RangeError('Invalid address');
    return value;
  }

  /** RFC 2047 for anything outside printable ASCII. */
  static #encodeHeader(value) {
    const plain = MimeMessage.#plain(value);
    if (/^[\x20-\x7e]*$/.test(plain)) return plain;
    return `=?UTF-8?B?${Buffer.from(plain, 'utf8').toString('base64')}?=`;
  }
}

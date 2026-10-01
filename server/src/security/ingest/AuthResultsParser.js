const GOOGLE_AUTHSERV_ID = 'mx.google.com';

/**
 * @typedef {object} AuthResults
 * @property {boolean} trusted true only when the top-most Authentication-Results header is Google's
 * @property {{ result: string, mailFrom: string | null }} spf
 * @property {{ result: string, domain: string | null }[]} dkim one entry per signature checked
 * @property {{ result: string, headerFrom: string | null }} dmarc
 */

/**
 * Reads SPF/DKIM/DMARC results from the Authentication-Results header Google stamps on receipt.
 *
 * Senders can add their own Authentication-Results headers, but Google always prepends its stamp
 * above everything the sender wrote. So only the very first such header is trusted, and only if
 * Google wrote it; any other case yields untrusted `none` results (fail closed).
 */
export class AuthResultsParser {
  /**
   * @param {{ key: string, value: string }[]} headers in document order, top first
   * @returns {AuthResults}
   */
  parse(headers) {
    const topMost = headers.find((header) => header.key === 'authentication-results');
    const [authservId, ...resultSpecs] = this.#stripComments(topMost?.value ?? '').split(';');
    // RFC 8601 allows an optional version number after the authserv-id.
    const isGoogle = authservId.trim().split(/\s+/)[0].toLowerCase() === GOOGLE_AUTHSERV_ID;
    if (!isGoogle) return this.#untrusted();

    const results = resultSpecs.map((spec) => this.#parseResult(spec)).filter(Boolean);
    const spf = results.find((result) => result.method === 'spf');
    const dmarc = results.find((result) => result.method === 'dmarc');

    return {
      trusted: true,
      spf: { result: spf?.result ?? 'none', mailFrom: spf?.props['smtp.mailfrom'] ?? null },
      dkim: results
        .filter((result) => result.method === 'dkim')
        .map((result) => ({ result: result.result, domain: this.#dkimDomain(result.props) })),
      dmarc: { result: dmarc?.result ?? 'none', headerFrom: dmarc?.props['header.from'] ?? null },
    };
  }

  #untrusted() {
    return {
      trusted: false,
      spf: { result: 'none', mailFrom: null },
      dkim: [],
      dmarc: { result: 'none', headerFrom: null },
    };
  }

  /** Removes RFC 5322 comments, including nested ones, so `;` or `=` inside them can't confuse parsing. */
  #stripComments(value) {
    let output = '';
    let depth = 0;
    for (const char of value) {
      if (char === '(') depth += 1;
      else if (char === ')' && depth > 0) depth -= 1;
      else if (depth === 0) output += char;
    }
    return output;
  }

  /** Parses `dkim=pass header.i=@example.com header.s=sel` into method, result and properties. */
  #parseResult(spec) {
    const [methodResult, ...propTokens] = spec.trim().split(/\s+/);
    const match = /^([a-z0-9-]+)=([a-z]+)$/i.exec(methodResult ?? '');
    if (!match) return null;

    /** @type {Record<string, string>} */
    const props = {};
    for (const token of propTokens) {
      const separator = token.indexOf('=');
      if (separator > 0) {
        props[token.slice(0, separator).toLowerCase()] = token
          .slice(separator + 1)
          .replace(/"/g, '');
      }
    }
    return { method: match[1].toLowerCase(), result: match[2].toLowerCase(), props };
  }

  /** Google reports the signing domain as `header.i=@domain`; other stamps use `header.d`. */
  #dkimDomain(props) {
    const domain = props['header.d'] ?? props['header.i']?.split('@').pop();
    return domain ? domain.toLowerCase() : null;
  }
}

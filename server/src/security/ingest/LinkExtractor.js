import { parse } from 'parse5';

const LINK_TAGS = new Set(['a', 'area']);
// Stops at whitespace, quotes and brackets so `<https://x.com>` or `"https://x.com"` yields the bare URL.
const TEXT_URL = /\bhttps?:\/\/[^\s<>"'()[\]{}]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/**
 * @typedef {object} Link
 * @property {string} href the real target, exactly as written (trimmed)
 * @property {string} text what the reader sees; for plain-text links this is the URL itself
 * @property {'html'|'text'} source
 * @property {string | null} host lower-case, punycode-encoded host; null when the href is not an absolute http(s) URL
 */

/** Extracts every link from an email's HTML (href + visible text) and plain-text parts. */
export class LinkExtractor {
  /**
   * @param {{ html: string, text: string }} parts
   * @returns {Link[]} unique by (href, text, source)
   */
  extract({ html, text }) {
    const links = [...this.#fromHtml(html), ...this.#fromText(text)];
    const seen = new Set();
    return links.filter((link) => {
      const key = `${link.source}\u0000${link.href}\u0000${link.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  #fromHtml(html) {
    if (!html) return [];
    const links = [];
    const visit = (node) => {
      if (LINK_TAGS.has(node.tagName)) {
        const href = this.#attribute(node, 'href')?.trim();
        if (href && !href.startsWith('#')) {
          const visible =
            node.tagName === 'area' ? this.#attribute(node, 'alt') : this.#visibleText(node);
          links.push(this.#link(href, visible ?? '', 'html'));
        }
      }
      // <template> content lives on a separate fragment in parse5.
      for (const child of node.content?.childNodes ?? node.childNodes ?? []) visit(child);
    };
    visit(parse(html));
    return links;
  }

  #fromText(text) {
    if (!text) return [];
    return [...text.matchAll(TEXT_URL)].map((match) => {
      const href = match[0].replace(TRAILING_PUNCTUATION, '');
      return this.#link(href, href, 'text');
    });
  }

  /** Concatenated text of a link, falling back to image alt text for image-only buttons. */
  #visibleText(node) {
    const parts = [];
    const collect = (current) => {
      if (current.nodeName === '#text') parts.push(current.value);
      else if (current.tagName === 'img') parts.push(this.#attribute(current, 'alt') ?? '');
      for (const child of current.childNodes ?? []) collect(child);
    };
    collect(node);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  #attribute(node, name) {
    return node.attrs?.find((attr) => attr.name === name)?.value;
  }

  #link(href, text, source) {
    return { href, text, source, host: this.#host(href) };
  }

  #host(href) {
    try {
      const url = new URL(href);
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? url.hostname.toLowerCase()
        : null;
    } catch {
      // Unparseable href: no host to compare, signals treat it as unknown.
      return null;
    }
  }
}

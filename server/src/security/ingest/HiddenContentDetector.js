import { parse } from 'parse5';
import { BIDI_CONTROL_CHARS, ZERO_WIDTH_CHARS } from './TextNormalizer.js';

const SKIPPED_TAGS = new Set(['head', 'script', 'style', 'template', 'title']);
const BLOCK_TAGS = new Set([
  'address', 'article', 'blockquote', 'br', 'center', 'dd', 'div', 'dl', 'dt', 'footer', 'h1',
  'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'ol', 'p', 'pre', 'section', 'table',
  'td', 'th', 'tr', 'ul',
]); // prettier-ignore
const NAMED_COLORS = {
  black: [0, 0, 0], white: [255, 255, 255], gray: [128, 128, 128], grey: [128, 128, 128],
  silver: [192, 192, 192], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
  yellow: [255, 255, 0], navy: [0, 0, 128], maroon: [128, 0, 0], purple: [128, 0, 128],
  teal: [0, 128, 128], olive: [128, 128, 0], lime: [0, 255, 0], aqua: [0, 255, 255],
  fuchsia: [255, 0, 255],
}; // prettier-ignore
const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };
// RGB distance under which text is unreadable against its background (e.g. #fefefe on #fff).
const NEAR_COLOR_DISTANCE = 30;
const OFFSCREEN_PX = -100;
const COMMENT_PROSE_WORDS = 3;
const ATTRIBUTE_PROSE_WORDS = 8;

/**
 * @typedef {'display_none'|'visibility_hidden'|'opacity_zero'|'tiny_font'|'offscreen'|'clipped'|
 *   'color_matches_background'|'html_comment'|'attribute_text'|'zero_width'|'bidi_control'} HiddenTechnique
 * @typedef {{ technique: HiddenTechnique, text: string }} HiddenItem
 */

/**
 * Splits an email body into what a person actually sees and what is hidden from them, keeping
 * the hidden part as evidence: hidden text aimed at an AI is the classic prompt-injection carrier.
 */
export class HiddenContentDetector {
  /**
   * @param {{ html: string, text: string, subject: string, fromName: string | null }} email
   * @returns {{ visibleText: string, hidden: HiddenItem[] }}
   */
  detect({ html, text, subject, fromName }) {
    const { visibleText, hidden } = html ? this.#walkHtml(html) : { visibleText: text, hidden: [] };
    const shown = [subject, fromName ?? '', visibleText];
    return {
      visibleText,
      hidden: [
        ...hidden,
        ...this.#invisibleChars(shown, ZERO_WIDTH_CHARS, 'zero_width'),
        ...this.#invisibleChars(shown, BIDI_CONTROL_CHARS, 'bidi_control'),
      ],
    };
  }

  #walkHtml(html) {
    // scriptingEnabled: false parses <noscript> content as markup, which mail clients display.
    const document = parse(html, { scriptingEnabled: false });
    const rules = this.#styleRules(document);
    const visible = [];
    const hidden = [];
    let run = null;

    const flush = () => {
      const runText = run?.parts.join('').replace(/\s+/g, ' ').trim();
      if (runText) hidden.push({ technique: run.technique, text: runText });
      run = null;
    };

    const visit = (node, ctx) => {
      if (node.nodeName === '#comment') {
        if (this.#isProseComment(node.data))
          hidden.push({ technique: 'html_comment', text: node.data.trim() });
        return;
      }
      if (node.nodeName === '#text') {
        const technique = this.#hiddenBy(ctx);
        if (!technique) {
          if (node.value.trim()) flush();
          visible.push(node.value);
        } else if (node.value.trim()) {
          if (run?.technique !== technique) flush();
          run ??= { technique, parts: [] };
          run.parts.push(node.value);
        }
        return;
      }
      if (SKIPPED_TAGS.has(node.tagName)) return;

      const childCtx = node.tagName ? this.#elementContext(node, ctx, rules) : ctx;
      if (node.tagName) this.#recordAttributeText(node, hidden);
      const isBlock = BLOCK_TAGS.has(node.tagName);
      if (isBlock) visible.push('\n');
      for (const child of node.childNodes ?? []) visit(child, childCtx);
      if (isBlock) visible.push('\n');
    };

    visit(document, {
      displayNone: false,
      visibilityHidden: false,
      tinyFont: false,
      opacityZero: false,
      offscreen: false,
      clipped: false,
      color: BLACK,
      background: WHITE,
    });
    flush();
    return { visibleText: visible.join(''), hidden };
  }

  /** First technique hiding text in this context, or null when a person can read it. */
  #hiddenBy(ctx) {
    if (ctx.displayNone) return 'display_none';
    if (ctx.visibilityHidden) return 'visibility_hidden';
    if (ctx.opacityZero) return 'opacity_zero';
    if (ctx.tinyFont) return 'tiny_font';
    if (ctx.offscreen) return 'offscreen';
    if (ctx.clipped) return 'clipped';
    if (ctx.color.a === 0 || this.#distance(ctx.color, ctx.background) < NEAR_COLOR_DISTANCE) {
      return 'color_matches_background';
    }
    return null;
  }

  /** Applies CSS inheritance: display/opacity/offscreen hide whole subtrees, the rest can be overridden. */
  #elementContext(element, ctx, rules) {
    const style = this.#declarations(element, rules);
    const attr = (name) => this.#attribute(element, name);
    const px = (value) => this.#pixels(value);
    const zero = (value) => value !== undefined && px(value) === 0;
    const background = this.#parseColor(
      style['background-color'] ?? this.#firstColor(style.background) ?? attr('bgcolor'),
    );

    return {
      displayNone: ctx.displayNone || style.display === 'none' || attr('hidden') !== undefined,
      visibilityHidden:
        style.visibility === undefined
          ? ctx.visibilityHidden
          : style.visibility === 'hidden' || style.visibility === 'collapse',
      tinyFont:
        style['font-size'] === undefined ? ctx.tinyFont : this.#isTinyFont(style['font-size']),
      opacityZero: ctx.opacityZero || Number.parseFloat(style.opacity) <= 0.05,
      offscreen:
        ctx.offscreen ||
        px(style['text-indent']) <= OFFSCREEN_PX ||
        (['absolute', 'fixed'].includes(style.position) &&
          (px(style.left) <= OFFSCREEN_PX || px(style.top) <= OFFSCREEN_PX)),
      clipped:
        ctx.clipped ||
        (style.overflow === 'hidden' &&
          [style.height, style['max-height'], style.width, style['max-width']].some(zero)),
      color:
        this.#parseColor(style.color ?? (element.tagName === 'font' ? attr('color') : undefined)) ??
        ctx.color,
      background: background && background.a > 0 ? background : ctx.background,
    };
  }

  /** Stylesheet rules first, inline style last. Specificity is ignored on purpose: erring
   *  toward "hidden" only removes text from the Reader and adds evidence; it never hides an attack. */
  #declarations(element, rules) {
    const classes = (this.#attribute(element, 'class') ?? '').split(/\s+/).filter(Boolean);
    const id = this.#attribute(element, 'id');
    const style = {};
    for (const rule of rules) {
      if (this.#matches(rule.selector, element.tagName, classes, id))
        Object.assign(style, rule.declarations);
    }
    return Object.assign(style, this.#parseDeclarations(this.#attribute(element, 'style') ?? ''));
  }

  /** Collects simple-selector rules (tag, .class, #id, combinations) from every <style> block. */
  #styleRules(document) {
    const css = [];
    const collect = (node) => {
      if (node.tagName === 'style')
        css.push(node.childNodes.map((child) => child.value ?? '').join(''));
      for (const child of node.childNodes ?? []) collect(child);
    };
    collect(document);

    const rules = [];
    // Inner rules of @media blocks match too, so media-gated hiding is caught.
    const source = css.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selectors, body] of source.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
      const declarations = this.#parseDeclarations(body);
      for (const selector of selectors.split(',')) {
        const parsed = /^(\*|[a-z][a-z0-9]*)?((?:[.#][\w-]+)*)$/i.exec(selector.trim());
        if (parsed && (parsed[1] || parsed[2])) {
          rules.push({
            selector: {
              tag: parsed[1] && parsed[1] !== '*' ? parsed[1].toLowerCase() : null,
              classes: [...parsed[2].matchAll(/\.([\w-]+)/g)].map((m) => m[1]),
              id: /#([\w-]+)/.exec(parsed[2])?.[1] ?? null,
            },
            declarations,
          });
        }
      }
    }
    return rules;
  }

  #matches(selector, tagName, classes, id) {
    return (
      (!selector.tag || selector.tag === tagName) &&
      (!selector.id || selector.id === id) &&
      selector.classes.every((name) => classes.includes(name))
    );
  }

  #parseDeclarations(css) {
    const declarations = {};
    for (const declaration of css.split(';')) {
      const separator = declaration.indexOf(':');
      if (separator > 0) {
        const property = declaration.slice(0, separator).trim().toLowerCase();
        declarations[property] = declaration
          .slice(separator + 1)
          .replace(/!important/i, '')
          .trim()
          .toLowerCase();
      }
    }
    return declarations;
  }

  #isTinyFont(value) {
    const match = /^(-?[\d.]+)([a-z%]*)$/.exec(value);
    if (!match) return false;
    const size = Number.parseFloat(match[1]);
    const unit = match[2];
    if (size <= 0) return true;
    if (unit === 'px' || unit === 'pt') return size <= 1;
    if (unit === 'em' || unit === 'rem') return size <= 0.1;
    if (unit === '%') return size <= 10;
    return false;
  }

  /** Numeric value of a length; non-px units are treated as px, which is close enough for "-9999". */
  #pixels(value) {
    const match = /^(-?[\d.]+)[a-z%]*$/.exec(value ?? '');
    return match ? Number.parseFloat(match[1]) : Number.NaN;
  }

  #firstColor(value) {
    return value?.split(/\s+(?![^(]*\))/).find((token) => this.#parseColor(token));
  }

  /** @returns {{ r: number, g: number, b: number, a: number } | null} */
  #parseColor(value) {
    if (!value) return null;
    const color = value.trim().toLowerCase();
    if (color === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    if (NAMED_COLORS[color]) {
      const [r, g, b] = NAMED_COLORS[color];
      return { r, g, b, a: 1 };
    }
    const hex = /^#?([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.exec(color)?.[1];
    if (hex) {
      const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
      const [r, g, b, a = 255] = full.match(/../g).map((pair) => Number.parseInt(pair, 16));
      return { r, g, b, a: a / 255 };
    }
    const rgb = /^rgba?\(([^)]+)\)$/
      .exec(color)?.[1]
      .split(/[\s,/]+/)
      .filter(Boolean);
    if (rgb?.length >= 3) {
      const [r, g, b] = rgb.slice(0, 3).map((part) => Number.parseFloat(part));
      const alpha =
        rgb[3] === undefined ? 1 : Number.parseFloat(rgb[3]) / (rgb[3].endsWith('%') ? 100 : 1);
      return { r, g, b, a: alpha };
    }
    return null;
  }

  #distance(first, second) {
    return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
  }

  /** Conditional comments (`[if mso]`) are Outlook layout plumbing, not prose. */
  #isProseComment(data) {
    const trimmed = data.trim();
    if (/^\[(if|endif)\b/i.test(trimmed)) return false;
    return this.#wordCount(trimmed) >= COMMENT_PROSE_WORDS;
  }

  #recordAttributeText(element, hidden) {
    for (const name of ['alt', 'title']) {
      const value = this.#attribute(element, name)?.trim();
      if (value && this.#wordCount(value) >= ATTRIBUTE_PROSE_WORDS) {
        hidden.push({ technique: 'attribute_text', text: value });
      }
    }
  }

  #wordCount(text) {
    return text.match(/\p{L}{2,}/gu)?.length ?? 0;
  }

  /** Reports invisible characters by code point (they carry no readable text of their own). */
  #invisibleChars(texts, pattern, technique) {
    const counts = new Map();
    for (const char of texts.join('').match(pattern) ?? []) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    if (counts.size === 0) return [];
    const summary = [...counts]
      .map(
        ([char, count]) =>
          `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} x${count}`,
      )
      .join(', ');
    return [{ technique, text: summary }];
  }

  #attribute(node, name) {
    return node.attrs?.find((attr) => attr.name === name)?.value;
  }
}

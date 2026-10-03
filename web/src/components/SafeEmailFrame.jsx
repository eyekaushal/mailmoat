import DOMPurify from 'dompurify';
import { useMemo } from 'react';

const sanitiser = DOMPurify();

// Only inline `data:` images may load. Everything else (remote images, CSS urls, media) would
// let an email phone home or leak data by rendering (SECURITY_APPROACH §7.7, threat T2).
const URL_ATTRIBUTES = new Set(['src', 'srcset', 'poster', 'background', 'xlink:href', 'href']);
sanitiser.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'style' && /url\s*\(/i.test(data.attrValue)) {
    data.keepAttr = false;
    return;
  }
  if (!URL_ATTRIBUTES.has(data.attrName)) return;
  if (data.attrName === 'href') {
    // Links stay visible as text but never navigate; the detail view shows them disarmed.
    data.keepAttr = false;
    return;
  }
  if (!/^data:image\//i.test(data.attrValue.trim())) data.keepAttr = false;
});
sanitiser.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'style') node.remove();
});

const FRAME_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

/**
 * @param {string} html raw email HTML
 * @returns {string} HTML with scripts, forms, styles, remote content and navigation removed
 */
export function sanitiseEmailHtml(html) {
  return sanitiser.sanitize(html ?? '', {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['form', 'input', 'button', 'select', 'textarea', 'style', 'link', 'meta', 'base'],
    FORBID_ATTR: ['target', 'formaction', 'ping'],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * "View original": sanitised email HTML inside a fully sandboxed iframe whose own CSP blocks
 * every remote load. No scripts, no forms, no navigation, no tracking pixels.
 * @param {{ html: string, title?: string, className?: string }} props
 */
export function SafeEmailFrame({ html, title = 'Original email', className = '' }) {
  const srcDoc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8">` +
      `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">` +
      `<style>body{margin:12px;font:14px/1.5 system-ui,sans-serif;color:#16181d;background:#fff;word-wrap:break-word}img{max-width:100%}</style>` +
      `</head><body>${sanitiseEmailHtml(html)}</body></html>`,
    [html],
  );
  return (
    <iframe
      title={title}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      className={`w-full rounded-lg border border-line bg-white ${className}`}
    />
  );
}

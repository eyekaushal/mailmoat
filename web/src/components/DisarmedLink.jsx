import { ExternalLink, Link2Off } from 'lucide-react';
import { useState } from 'react';

/** @param {string} href */
function hostOf(href) {
  try {
    // `hostname` is the ASCII (punycode) form, so a look-alike domain shows as `xn--…`, not as the
    // characters the attacker chose.
    return new URL(href).hostname || href;
  } catch {
    return 'unreadable address';
  }
}

/**
 * A link from an email, shown as `visible text → real-domain` (SECURITY_APPROACH §7.7). It is
 * only clickable on a SAFE email; otherwise the user must choose "Open anyway". Signal ids
 * passed in (S14–S18) appear inline beside it.
 * @param {{ href: string, text?: string | null, level: string | null | undefined,
 *   signals?: { id: string }[] }} props
 */
export function DisarmedLink({ href, text, level, signals = [] }) {
  const [opened, setOpened] = useState(false);
  const host = hostOf(href);
  const shown = text?.trim() || host;
  const clickable = level === 'SAFE' || opened;

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 text-sm">
      <span className="truncate font-medium">{shown}</span>
      <span aria-hidden="true" className="text-muted">
        →
      </span>
      {clickable ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-accent underline-offset-2 hover:underline"
        >
          {host}
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </a>
      ) : (
        <span className="inline-flex items-center gap-1 font-mono text-muted">
          <Link2Off aria-hidden="true" className="size-3.5" />
          {host}
        </span>
      )}
      {signals.map((signal) => (
        <span
          key={signal.id}
          className="rounded bg-warn-soft px-1 py-0.5 font-mono text-[11px] text-warn"
          title={signal.reason ?? signal.id}
        >
          {signal.id}
        </span>
      ))}
      {!clickable && (
        <button
          type="button"
          onClick={() => setOpened(true)}
          className="rounded border border-line px-1.5 py-0.5 text-xs text-muted hover:bg-surface-2"
        >
          Open anyway
        </button>
      )}
    </span>
  );
}

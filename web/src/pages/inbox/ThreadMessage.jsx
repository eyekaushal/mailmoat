import { Paperclip } from '@phosphor-icons/react';
import { DisarmedLink } from '../../components/DisarmedLink.jsx';
import { dateTime, shortDate } from '../../lib/dates.js';
import { Avatar } from '../../ui/Avatar.jsx';
import { RiskDot } from '../../ui/RiskDot.jsx';
import { Tag, riskLabelFor } from '../../ui/Tag.jsx';

const PREVIEW_CHARS = 160;

/** The one line a collapsed message shows: the start of its visible text, whitespace folded. */
export function previewOf(message) {
  if (message.unreadable) return 'This message could not be read';
  const text = (message.text ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, PREVIEW_CHARS) : '(no visible text)';
}

/**
 * One message of a conversation (PLAN §13.6). Collapsed: sender, one-line preview, date.
 * Expanded: 40 px avatar, name, address, date, the AI summary (opened message only, labelled),
 * the plain visible text, links as `text → host` (clickable only when this message is SAFE) and
 * attachment names. Nothing here is HTML; nothing is fetched from the network.
 * @param {{ message: object, expanded: boolean, onToggle: () => void, opened?: boolean,
 *   summary?: string | null, now?: Date }} props
 */
export function ThreadMessage({ message, expanded, onToggle, opened = false, summary, now }) {
  const name = message.from?.name || message.from?.address || 'Unknown sender';
  const address = message.from?.name ? message.from.address : null;
  const inbound = message.direction === 'inbound';
  const level = message.verdict?.level ?? null;
  // The opened email's risk word sits in the title row; other messages carry their own.
  const riskTag = inbound && !opened ? riskLabelFor(message.verdict) : null;
  const avatar = (size) => (
    <Avatar
      name={name}
      hueKey={message.from?.address}
      initials={message.avatar?.initials}
      hue={message.avatar?.hue}
      size={size}
    />
  );

  if (!expanded) {
    return (
      <li>
        <button
          type="button"
          aria-expanded="false"
          onClick={onToggle}
          className="flex h-12 w-full items-center gap-3 px-5 text-left transition-colors duration-150 ease-out-soft hover:bg-surface-2"
        >
          {avatar('md')}
          <span className="flex w-44 shrink-0 items-center gap-1.5">
            {inbound && <RiskDot verdict={message.verdict} />}
            <span className="truncate font-medium">{name}</span>
          </span>
          <span className="min-w-0 flex-1 truncate text-secondary">{previewOf(message)}</span>
          <time dateTime={message.date} className="shrink-0 text-sm text-tertiary tabular-nums">
            {shortDate(message.date, now)}
          </time>
        </button>
      </li>
    );
  }

  return (
    <li className="px-5 py-4">
      <button
        type="button"
        aria-expanded="true"
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-md text-left"
      >
        {avatar('lg')}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{name}</span>
            {riskTag && <Tag label={riskTag} />}
          </span>
          {address && <span className="block truncate text-sm text-secondary">{address}</span>}
        </span>
        <time dateTime={message.date} className="shrink-0 text-sm text-tertiary tabular-nums">
          {dateTime(message.date, now)}
        </time>
      </button>

      {summary && (
        <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-sm text-secondary">
          <span className="font-medium">AI summary</span>
          <span aria-hidden="true"> · </span>
          <span className="whitespace-pre-wrap">{summary}</span>
        </p>
      )}

      {message.unreadable ? (
        <p className="mt-4 text-md text-secondary">
          This message could not be read, so nothing from it is shown.
        </p>
      ) : (
        <>
          <pre className="mt-4 font-sans text-md break-words whitespace-pre-wrap">
            {message.text || '(no visible text)'}
          </pre>
          {message.textTruncated && (
            <p className="mt-2 text-sm text-tertiary">Text shortened for display.</p>
          )}
          {message.links.length > 0 && (
            <section aria-label="Links" className="mt-4">
              <h3 className="mb-1 text-sm text-secondary">Links</h3>
              <ul className="space-y-1">
                {message.links.map((link, index) => (
                  <li key={`${link.href}-${index}`}>
                    <DisarmedLink href={link.href} text={link.text} level={level} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {message.attachments.length > 0 && (
            <section aria-label="Attachments" className="mt-4">
              <ul className="flex flex-wrap gap-1.5">
                {message.attachments.map((attachment, index) => (
                  <li
                    key={index}
                    className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-sm"
                  >
                    <Paperclip aria-hidden="true" size={14} className="text-secondary" />
                    <span className="break-all">{attachment.filename ?? 'unnamed'}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-sm text-tertiary">
                Attachments are never opened or downloaded by mailmoat.
              </p>
            </section>
          )}
        </>
      )}
    </li>
  );
}

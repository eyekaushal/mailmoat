import { Link } from 'react-router';
import { LoadingState } from '../../components/LoadingState.jsx';
import { shortDate } from '../../lib/dates.js';
import { useApi } from '../../lib/useApi.js';
import { RiskDot } from '../../ui/RiskDot.jsx';

/** How many stored reasons one feed line shows; the trace has them all. */
const REASONS_SHOWN = 3;

/**
 * PRD F11.2: every non-SAFE email, each line a link that opens the email with its trace
 * (`?trace=1`). Risk is the red dot with its tooltip; the words are plain text.
 */
export function ThreatFeed() {
  const { data: feed, error } = useApi('/security/feed?limit=100', { refreshInterval: 30_000 });
  if (error)
    return (
      <p role="alert" className="px-5 py-3 text-sm text-danger">
        {error.message}
      </p>
    );
  if (!feed) return <LoadingState label="Loading threats…" />;
  if (feed.length === 0)
    return (
      <p className="px-5 py-4 text-base text-secondary">No suspicious or dangerous email so far.</p>
    );
  return (
    <ul className="divide-y divide-line border-t border-line">
      {feed.map((item) => (
        <li key={item.gmailId}>
          <Link
            to={`/inbox/${item.gmailId}?trace=1`}
            aria-label={`Open ${item.fromName || item.fromAddr} and its trace`}
            className="block px-5 py-2.5 transition-colors duration-150 ease-out-soft hover:bg-surface-2"
          >
            <span className="flex items-center gap-2">
              <RiskDot verdict={{ level: item.level }} />
              <span className="min-w-0 truncate font-medium">{item.fromName || item.fromAddr}</span>
              {item.fromName && (
                <span className="min-w-0 truncate text-sm text-secondary">{item.fromAddr}</span>
              )}
              {item.injectionAttempt && (
                <span className="shrink-0 rounded-[4px] bg-surface-3 px-1.5 text-xs text-secondary">
                  injection attempt blocked
                </span>
              )}
              {item.userFeedback === 'not_phishing' && (
                <span className="shrink-0 rounded-[4px] bg-surface-3 px-1.5 text-xs text-secondary">
                  you: not phishing
                </span>
              )}
              <time
                dateTime={item.date}
                className="ml-auto shrink-0 pl-3 text-sm text-tertiary tabular-nums"
              >
                {shortDate(item.date)}
              </time>
            </span>
            <span className="mt-0.5 block truncate pl-[14px] text-sm text-secondary">
              {item.reasons.slice(0, REASONS_SHOWN).join(' · ')}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

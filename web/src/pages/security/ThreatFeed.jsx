import { Link } from 'react-router';
import { LoadingState } from '../../components/LoadingState.jsx';
import { RiskBadge } from '../../components/RiskBadge.jsx';
import { useApi } from '../../lib/useApi.js';

/** PRD F11.2: every non-SAFE email with its reasons and what happened to it. */
export function ThreatFeed() {
  const { data: feed, error } = useApi('/security/feed?limit=100', { refreshInterval: 30_000 });
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error.message}
      </p>
    );
  if (!feed) return <LoadingState label="Loading threats…" />;
  if (feed.length === 0)
    return <p className="text-sm text-muted">No suspicious or dangerous email so far.</p>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Threat feed">
      {feed.map((item) => (
        <li key={item.gmailId} className="flex flex-wrap items-start gap-3 px-4 py-3">
          <RiskBadge level={item.level} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="truncate font-medium">{item.fromName || item.fromAddr}</span>
              {item.fromName && (
                <span className="truncate font-mono text-xs text-muted">{item.fromAddr}</span>
              )}
              {item.injectionAttempt && (
                <span className="rounded bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger">
                  Injection attempt blocked
                </span>
              )}
              {item.userFeedback === 'not_phishing' && (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
                  you: not phishing
                </span>
              )}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted">
              {item.reasons.slice(0, 3).map((reason, index) => (
                <li key={index} className="break-words whitespace-pre-wrap">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
          <div className="text-right text-xs text-muted">
            <time dateTime={item.date}>
              {new Date(item.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
            </time>
            <br />
            <Link to={`/inbox/${item.gmailId}`} className="text-accent hover:underline">
              open · trace
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

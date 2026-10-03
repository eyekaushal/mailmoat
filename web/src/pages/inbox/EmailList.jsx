import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { CategoryBadge } from '../../components/CategoryBadge.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { RiskBadge } from '../../components/RiskBadge.jsx';
import { useApi, useApiClient } from '../../lib/useApi.js';

/** Today → time; this year → day and month; else the date. */
export function shortDate(iso, now = new Date()) {
  const date = new Date(iso);
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString();
}

/**
 * The rows of one tab (PRD F5.2). Subjects are not stored (only hashed), so the row shows the
 * sender and the Reader's summary, marked as AI output about an untrusted email.
 * @param {{ query: string, selectedId?: string | null, onSelect: (gmailId: string) => void }} props
 */
export function EmailList({ query, selectedId, onSelect }) {
  const client = useApiClient();
  const { data: first, error } = useApi(query);
  const [more, setMore] = useState({ items: [], nextCursor: undefined, loading: false });

  if (error) {
    return (
      <p role="alert" className="p-4 text-sm text-danger">
        {error.message}
      </p>
    );
  }
  if (!first) return <LoadingState label="Loading emails…" />;

  const items = [...first.items, ...more.items];
  const nextCursor = more.nextCursor === undefined ? first.nextCursor : more.nextCursor;
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing here"
        description="New mail appears as soon as it is synced and analysed."
      />
    );
  }

  async function loadMore() {
    setMore((m) => ({ ...m, loading: true }));
    const page = await client.get(`${query}&cursor=${encodeURIComponent(nextCursor)}`);
    setMore((m) => ({
      items: [...m.items, ...page.items],
      nextCursor: page.nextCursor,
      loading: false,
    }));
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {items.map((email) => {
          const selected = email.gmailId === selectedId;
          return (
            <li key={email.gmailId}>
              <button
                type="button"
                onClick={() => onSelect(email.gmailId)}
                aria-current={selected ? 'true' : undefined}
                className={`block w-full px-4 py-3 text-left hover:bg-surface-2 ${selected ? 'bg-accent-soft/60' : ''}`}
              >
                <div className="flex items-center gap-2">
                  {!email.isRead && (
                    <span aria-label="Unread" className="size-2 shrink-0 rounded-full bg-accent" />
                  )}
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${email.isRead ? '' : 'font-semibold'}`}
                  >
                    {email.fromName || email.fromAddr}
                  </span>
                  <time dateTime={email.date} className="shrink-0 text-xs text-muted">
                    {shortDate(email.date)}
                  </time>
                </div>
                <p className="mt-0.5 flex items-start gap-1 text-sm text-muted">
                  <Sparkles
                    aria-label="AI summary of an untrusted email"
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  <span className="line-clamp-2">{email.summary ?? 'Not analysed yet.'}</span>
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <RiskBadge level={email.verdict?.level} size="sm" />
                  {email.category && <CategoryBadge category={email.category} />}
                  {email.verdict?.injectionAttempt && (
                    <span className="rounded bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger">
                      Injection attempt
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {nextCursor && (
        <div className="p-3 text-center">
          <Button variant="secondary" onClick={loadMore} disabled={more.loading}>
            {more.loading ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

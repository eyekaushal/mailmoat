import { MagnifyingGlass } from '@phosphor-icons/react';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { Button } from '../../components/Button.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { dayGroup } from '../../lib/dates.js';
import { useApi, useApiClient } from '../../lib/useApi.js';
import { EmailRow } from './EmailRow.jsx';

/** Rows in list order, split under Today / Yesterday / date headings. */
export function groupByDay(items, now) {
  const groups = [];
  for (const email of items) {
    const title = dayGroup(email.date, now);
    const last = groups.at(-1);
    if (last?.title === title) last.items.push(email);
    else groups.push({ title, items: [email] });
  }
  return groups;
}

/**
 * The rows of one tab or one search (PLAN §13.5). `query` is the first page's path; both
 * `GET /emails` and `GET /search` page with `&cursor=`. Row actions go through the server, so the
 * Policy Engine still decides; the outcome is one quiet line above the list, never a toast.
 * @param {{ query: string, terms?: string[], now?: Date, onOpen: (gmailId: string) => void,
 *   onReply: (gmailId: string) => void }} props `onReply` opens the email with its composer
 */
export function EmailList({ query, terms = [], now, onOpen, onReply }) {
  const client = useApiClient();
  const { mutate: mutateAll } = useSWRConfig();
  const { data: first, error } = useApi(query);
  const [more, setMore] = useState({ items: [], nextCursor: undefined, loading: false });
  const [gone, setGone] = useState(() => new Set());
  const [notice, setNotice] = useState(null);
  const searching = query.startsWith('/search');

  if (error) {
    return (
      <p role="alert" className="px-5 py-4 text-base text-danger">
        {error.message}
      </p>
    );
  }
  if (!first) return <LoadingState label={searching ? 'Searching Gmail…' : 'Loading emails…'} />;

  const items = [...first.items, ...more.items].filter((email) => !gone.has(email.gmailId));
  const nextCursor = more.nextCursor === undefined ? first.nextCursor : more.nextCursor;

  async function loadMore() {
    setMore((state) => ({ ...state, loading: true }));
    const page = await client.get(`${query}&cursor=${encodeURIComponent(nextCursor)}`);
    setMore((state) => ({
      items: [...state.items, ...page.items],
      nextCursor: page.nextCursor,
      loading: false,
    }));
  }

  async function act(work) {
    setNotice(null);
    try {
      setNotice({ ok: true, text: await work() });
      await mutateAll(
        (key) =>
          typeof key === 'string' && (key.startsWith('/emails') || key.startsWith('/summary')),
      );
    } catch (caught) {
      setNotice({ ok: false, text: caught.message });
    }
  }

  const archive = (email) =>
    act(async () => {
      const result = await client.post(`/emails/${email.gmailId}/archive`);
      if (!result.done) return `Not archived: ${result.reason}`;
      setGone((set) => new Set(set).add(email.gmailId));
      return 'Archived.';
    });

  const trust = (email) =>
    act(async () => {
      await client.post(`/emails/${email.gmailId}/trust-sender`, { trusted: true });
      return 'Sender marked trusted. This only stops first-time-sender warnings; risk levels are never lowered.';
    });

  return (
    <div className="pb-4">
      {notice && (
        <p
          role="status"
          className={`px-5 py-2 text-sm ${notice.ok ? 'text-secondary' : 'text-danger'}`}
        >
          {notice.text}
        </p>
      )}
      {items.length === 0 &&
        (searching ? (
          <EmptyState
            icon={MagnifyingGlass}
            title="No matches"
            description="Gmail found nothing for this search."
          />
        ) : (
          <EmptyState
            title="Nothing here"
            description="New mail appears as soon as it is synced and analysed."
          />
        ))}
      {groupByDay(items, now).map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h3 className="px-5 pt-3 pb-1 text-sm font-medium text-secondary">{group.title}</h3>
          <ul>
            {group.items.map((email) => (
              <EmailRow
                key={email.gmailId}
                email={email}
                terms={terms}
                now={now}
                onOpen={() => onOpen(email.gmailId)}
                onArchive={() => archive(email)}
                onReply={() => onReply(email.gmailId)}
                onTrust={() => trust(email)}
              />
            ))}
          </ul>
        </section>
      ))}
      {nextCursor && (
        <div className="flex justify-center pt-3">
          <Button variant="ghost" onClick={loadMore} disabled={more.loading}>
            {more.loading ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

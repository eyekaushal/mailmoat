import { CalendarClock, Reply, ShieldAlert, Sparkles, Sun } from 'lucide-react';
import { Link } from 'react-router';
import { LoadingState } from '../../components/LoadingState.jsx';
import { useApi } from '../../lib/useApi.js';

/** PRD F14: today's inbox in numbers, plus a few untrusted one-line summaries that need a reply. */
export function TodayCard() {
  const { data: today, error } = useApi('/summary/today', { refreshInterval: 60_000 });
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error.message}
      </p>
    );
  if (!today) return <LoadingState label="Summarising today…" />;
  const threats = today.threats.suspicious + today.threats.dangerous;
  const rules = Object.entries(today.byRule).sort((a, b) => b[1] - a[1]);
  return (
    <section aria-label="Today" className="mx-auto max-w-xl space-y-5 p-6">
      <header className="flex items-center gap-2">
        <Sun aria-hidden="true" className="size-5 text-warn" />
        <h2 className="text-lg font-semibold">Today</h2>
        <span className="ml-auto text-sm text-muted">{today.received} received</span>
      </header>
      <dl className="grid grid-cols-3 gap-3 text-center">
        {[
          [Reply, today.needsReply, 'need a reply', 'text-accent'],
          [CalendarClock, today.meetingsProposed, 'meetings proposed', 'text-fg'],
          [
            ShieldAlert,
            threats,
            threats === 1 ? 'threat flagged' : 'threats flagged',
            threats ? 'text-danger' : 'text-muted',
          ],
        ].map(([Icon, value, label, tone]) => (
          <div key={label} className="rounded-lg border border-line bg-surface p-3">
            <Icon aria-hidden="true" className={`mx-auto size-4 ${tone}`} />
            <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
            <dt className="text-xs text-muted">{label}</dt>
          </div>
        ))}
      </dl>
      {today.threats.injection > 0 && (
        <p className="text-sm text-danger">
          {today.threats.injection} email{today.threats.injection === 1 ? '' : 's'} tried to
          instruct the assistant. Nothing was followed.
        </p>
      )}
      {rules.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="By label">
          {rules.map(([name, count]) => (
            <li key={name} className="rounded-md bg-surface-2 px-2 py-1 text-xs">
              <span className="font-medium">{name}</span>{' '}
              <span className="text-muted">{count}</span>
            </li>
          ))}
        </ul>
      )}
      {today.highlights.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted">
            <Sparkles aria-hidden="true" className="size-3.5" /> Waiting for your reply · AI
            summaries of untrusted emails
          </p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {today.highlights.map((item) => (
              <li key={item.gmailId}>
                <Link
                  to={`/inbox/${item.gmailId}`}
                  className="block px-3 py-2 text-sm hover:bg-surface-2"
                >
                  <span className="font-mono text-xs text-muted">{item.from}</span>
                  <span className="block whitespace-pre-wrap">{item.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {today.received === 0 && <p className="text-sm text-muted">Nothing received yet today.</p>}
    </section>
  );
}

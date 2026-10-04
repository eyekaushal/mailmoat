import { ArrowBendUpLeft, CalendarDots, ShieldWarning, Tray } from '@phosphor-icons/react';
import { Link } from 'react-router';
import { LoadingState } from '../../components/LoadingState.jsx';
import { longDate } from '../../lib/dates.js';
import { useApi } from '../../lib/useApi.js';

function plural(count, one, many) {
  return count === 1 ? one : many;
}

/**
 * Today in the right panel (PRD F14, DESIGN.md §7): the day's numbers, the labels applied, and
 * the senders still waiting for a reply. The one-line summaries are AI output about untrusted
 * mail and are labelled as such; nothing here is red.
 */
export function TodayCard() {
  const { data: today, error } = useApi('/summary/today', { refreshInterval: 60_000 });
  if (error)
    return (
      <p role="alert" className="p-5 text-sm text-danger">
        {error.message}
      </p>
    );
  if (!today) return <LoadingState label="Summarising today…" />;
  const threats = today.threats.suspicious + today.threats.dangerous;
  const rules = Object.entries(today.byRule).sort((a, b) => b[1] - a[1]);
  const stats = [
    { Icon: Tray, value: today.received, text: 'received' },
    {
      Icon: ArrowBendUpLeft,
      value: today.needsReply,
      text: plural(today.needsReply, 'needs a reply', 'need a reply'),
    },
    {
      Icon: CalendarDots,
      value: today.meetingsProposed,
      text: plural(today.meetingsProposed, 'meeting proposed', 'meetings proposed'),
    },
    {
      Icon: ShieldWarning,
      value: threats,
      text: plural(threats, 'threat flagged', 'threats flagged'),
      to: '/security',
    },
  ];
  return (
    <section aria-label="Today" className="flex flex-col gap-5 p-5">
      <header>
        <h2 className="text-lg font-medium tracking-tight">Today</h2>
        <p className="text-sm text-secondary">{longDate(today.date)}</p>
      </header>
      <ul className="flex flex-col gap-1.5">
        {stats.map(({ Icon, value, text, to }) => {
          const line = (
            <>
              <Icon aria-hidden="true" size={16} className="shrink-0 text-secondary" />
              <span className="text-md font-medium tabular-nums">{value}</span>
              <span className="text-base text-secondary">{text}</span>
            </>
          );
          return (
            <li key={text} className="flex items-center gap-2.5">
              {to ? (
                <Link to={to} className="flex items-center gap-2.5 hover:underline">
                  {line}
                </Link>
              ) : (
                line
              )}
            </li>
          );
        })}
      </ul>
      {today.threats.injection > 0 && (
        <p className="text-sm text-secondary">
          {today.threats.injection} {plural(today.threats.injection, 'email', 'emails')} tried to
          instruct the assistant. Nothing was followed.
        </p>
      )}
      {rules.length > 0 && (
        <ul aria-label="By label" className="flex flex-wrap gap-1.5">
          {rules.map(([name, count]) => (
            <li key={name} className="rounded-[4px] bg-surface-2 px-1.5 py-0.5 text-xs">
              <span className="font-medium">{name}</span>{' '}
              <span className="text-secondary tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      )}
      {today.highlights.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium text-secondary">Waiting for your reply</h3>
          <ul className="-mx-2 flex flex-col">
            {today.highlights.map((item) => (
              <li key={item.gmailId}>
                <Link
                  to={`/inbox/${item.gmailId}`}
                  className="block rounded-md px-2 py-1.5 transition-colors duration-150 ease-out-soft hover:bg-surface-2"
                >
                  <span className="block truncate text-base font-medium">{item.from}</span>
                  <span className="line-clamp-2 text-sm text-secondary">{item.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-tertiary">AI summaries of untrusted emails</p>
        </div>
      )}
      {today.received === 0 && (
        <p className="text-sm text-secondary">Nothing received yet today.</p>
      )}
    </section>
  );
}

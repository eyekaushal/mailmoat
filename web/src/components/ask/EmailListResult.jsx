import { useNavigate } from 'react-router';
import { shortDate } from '../../lib/dates.js';
import { useApi } from '../../lib/useApi.js';
import { Avatar } from '../../ui/Avatar.jsx';
import { RiskDot } from '../../ui/RiskDot.jsx';

/**
 * An Ask AI email list (PLAN §15.1 decision 3): the result carries ids; the rows (sender,
 * subject, snippet, date, risk) come from the inbox API, which may show them to the user. Each
 * row opens the email. Nothing here ever reaches the Planner.
 * @param {{ ids: string[], now?: Date }} props
 */
export function EmailListResult({ ids, now }) {
  const navigate = useNavigate();
  const { data, error } = useApi(ids.length > 0 ? `/emails?ids=${ids.join(',')}` : null);
  if (ids.length === 0) return null;
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error.message}
      </p>
    );
  if (!data) return <p className="text-sm text-secondary">Loading…</p>;
  return (
    <ul aria-label="Emails" className="ask-card divide-y divide-line overflow-hidden">
      {data.items.map((email) => {
        const sender = email.fromName || email.fromAddr;
        return (
          <li key={email.gmailId}>
            <button
              type="button"
              onClick={() => navigate(`/inbox/${email.gmailId}`)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150 ease-out-soft hover:bg-surface-2"
            >
              <Avatar
                name={sender}
                hueKey={email.fromAddr}
                initials={email.avatar?.initials}
                hue={email.avatar?.hue}
                size="sm"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <RiskDot verdict={email.verdict} />
                  <span className="truncate text-sm font-medium">{sender}</span>
                  <time
                    dateTime={email.date}
                    className="ml-auto shrink-0 text-xs text-tertiary tabular-nums"
                  >
                    {shortDate(email.date, now)}
                  </time>
                </span>
                <span className="block truncate text-sm">
                  {email.subject || '(no subject)'}
                  {email.snippet && <span className="text-secondary"> · {email.snippet}</span>}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

import { useState } from 'react';
import { Link } from 'react-router';
import { useSWRConfig } from 'swr';
import { LoadingState } from '../../components/LoadingState.jsx';
import { shortDate } from '../../lib/dates.js';
import { useApi, useApiClient } from '../../lib/useApi.js';
import { Avatar } from '../../ui/Avatar.jsx';
import { Switch } from '../../ui/Switch.jsx';
import { Tooltip } from '../../ui/Tooltip.jsx';
import { riskNote } from './EmailRow.jsx';

/**
 * The right panel while an email is open (PLAN §13.6): who sent it, the trusted toggle, and the
 * newest message of each recent thread from them. Trust only silences first-time-sender
 * warnings; it never lowers a risk level.
 * @param {{ gmailId: string, now?: Date }} props
 */
export function SenderCard({ gmailId, now }) {
  const client = useApiClient();
  const { mutate: mutateAll } = useSWRConfig();
  const { data, error } = useApi(`/emails/${gmailId}/sender`);
  const [failure, setFailure] = useState(null);

  if (error)
    return (
      <p role="alert" className="p-5 text-sm text-danger">
        {error.message}
      </p>
    );
  if (!data) return <LoadingState label="Loading sender…" />;

  async function setTrusted(trusted) {
    setFailure(null);
    try {
      await client.post(`/emails/${gmailId}/trust-sender`, { trusted });
      await mutateAll((key) => typeof key === 'string' && key.startsWith('/emails'));
    } catch (caught) {
      setFailure(caught.message);
    }
  }

  const name = data.name || data.address;
  return (
    <section aria-label="Sender" className="flex flex-col gap-5 p-5">
      <header className="flex items-center gap-3">
        <Avatar
          name={name}
          hueKey={data.address}
          initials={data.avatar?.initials}
          hue={data.avatar?.hue}
          size="lg"
        />
        <div className="min-w-0">
          <h2 className="truncate text-md font-medium">{name}</h2>
          {data.name && <p className="truncate text-sm text-secondary">{data.address}</p>}
        </div>
      </header>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="sender-trusted" className="text-base">
          Trusted sender
        </label>
        <Switch
          id="sender-trusted"
          aria-label="Trusted sender"
          checked={data.trusted}
          onCheckedChange={setTrusted}
        />
      </div>
      {failure && (
        <p role="alert" className="-mt-3 text-sm text-danger">
          {failure}
        </p>
      )}
      <p className="-mt-3 text-sm text-secondary tabular-nums">
        {data.receivedCount} received · {data.sentCount} sent
      </p>

      <section aria-label="Recent threads">
        <h3 className="mb-1 text-sm text-secondary">Recent threads</h3>
        {data.threads.length === 0 ? (
          <p className="text-sm text-tertiary">Nothing stored from them yet.</p>
        ) : (
          <ul className="-mx-2">
            {data.threads.map((thread) => {
              const risk = riskNote(thread.verdict);
              return (
                <li key={thread.threadId}>
                  <Link
                    to={`/inbox/${thread.gmailId}`}
                    aria-current={thread.threadId === data.threadId ? 'true' : undefined}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-base transition-colors duration-150 ease-out-soft hover:bg-surface-2 ${
                      thread.threadId === data.threadId ? 'bg-accent-soft' : ''
                    }`}
                  >
                    {risk && (
                      <Tooltip label={risk}>
                        <span
                          role="img"
                          aria-label={risk}
                          className={`size-1.5 shrink-0 rounded-full ${
                            thread.verdict ? 'bg-danger' : 'border border-tertiary'
                          }`}
                        />
                      </Tooltip>
                    )}
                    <span
                      className={`min-w-0 flex-1 truncate ${thread.isRead ? '' : 'font-medium'}`}
                    >
                      {thread.subject || '(no subject)'}
                    </span>
                    <time
                      dateTime={thread.date}
                      className="shrink-0 text-sm text-tertiary tabular-nums"
                    >
                      {shortDate(thread.date, now)}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

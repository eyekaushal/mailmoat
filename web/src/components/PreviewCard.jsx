import { CalendarPlus, Mail, Reply, ShieldAlert, Wrench } from 'lucide-react';

const KIND_META = {
  email: { title: 'Send email', confirm: 'Send', Icon: Mail },
  reply: { title: 'Reply', confirm: 'Save draft', Icon: Reply },
  event: { title: 'Calendar event', confirm: 'Save', Icon: CalendarPlus },
  action: { title: 'Action', confirm: 'Confirm', Icon: Wrench },
};

const FIELD_LABELS = {
  to: 'To',
  cc: 'Cc',
  subject: 'Subject',
  body: 'Body',
  email_id: 'Replying to',
  instructions: 'Instructions',
  title: 'Title',
  description: 'Description',
  start: 'Start',
  end: 'End',
  attendees: 'Attendees',
  label: 'Label',
  address: 'Sender',
  method: 'Method',
  text: 'Memory',
};

function labelFor(name) {
  return FIELD_LABELS[name] ?? name.replaceAll('_', ' ');
}

function textOf(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(textOf).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Where a value came from, in the user's words (PRD F8.4). */
function describeSource(source) {
  switch (source.type) {
    case 'user':
      return 'you';
    case 'email':
      return source.from
        ? `email from ${source.from}${source.date ? ` on ${source.date.slice(0, 10)}` : ''}`
        : 'an email';
    case 'planner':
      return 'the assistant';
    case 'contacts':
      return 'your contacts';
    case 'inbox':
      return 'your inbox';
    default:
      return source.type;
  }
}

/**
 * The preview of an action waiting for the user (PRD F8.3): the exact content as plain text and,
 * for every value, where it came from. Nothing here is clickable or rendered as HTML.
 * @param {{
 *   card: { approvalId: string, kind: string, tool: string, reason?: string,
 *     fields: Record<string, { value: unknown, sources: { type: string, from?: string, date?: string }[] }> },
 *   onDecide?: (action: 'approve' | 'reject') => void,
 *   busy?: boolean,
 *   children?: import('react').ReactNode,
 * }} props
 */
export function PreviewCard({ card, onDecide, busy = false, children }) {
  const { title, confirm, Icon } = KIND_META[card.kind] ?? KIND_META.action;
  const fields = Object.entries(card.fields ?? {});
  const fromEmail = fields.some(([, field]) =>
    field.sources?.some((source) => source.type === 'email'),
  );

  return (
    <article className="rounded-lg border border-line bg-surface shadow-sm">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Icon aria-hidden="true" className="size-4 text-accent" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto font-mono text-xs text-muted">{card.tool}</span>
      </header>
      <dl className="space-y-3 px-4 py-3">
        {fields.map(([name, field]) => (
          <div key={name}>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              {labelFor(name)}
            </dt>
            <dd className="mt-0.5 text-sm break-words whitespace-pre-wrap">
              {textOf(field.value)}
            </dd>
            {field.sources?.length > 0 && (
              <dd className="mt-0.5 text-xs text-muted">
                From {field.sources.map(describeSource).join(' and ')}
              </dd>
            )}
          </div>
        ))}
      </dl>
      {(card.reason || fromEmail) && (
        <p className="flex items-start gap-2 border-t border-line px-4 py-2 text-xs text-muted">
          <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {card.reason}
            {card.reason && fromEmail ? ' ' : ''}
            {fromEmail && 'Some content comes from an email, so check it before you confirm.'}
          </span>
        </p>
      )}
      {children}
      {onDecide && (
        <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide('reject')}
            className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide('approve')}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {confirm}
          </button>
        </footer>
      )}
    </article>
  );
}

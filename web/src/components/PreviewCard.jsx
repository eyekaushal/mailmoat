import {
  ArrowBendUpLeft,
  CalendarPlus,
  Envelope,
  ShieldWarning,
  Wrench,
} from '@phosphor-icons/react';
import { Button } from './Button.jsx';

const KIND_META = {
  email: { title: 'Send email', confirm: 'Send', Icon: Envelope },
  reply: { title: 'Reply', confirm: 'Save draft', Icon: ArrowBendUpLeft },
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
 * The preview of an action waiting for the user (PRD F8.3, PLAN §13.7): a quiet card with the
 * exact content as plain text and, under every value, a small line saying where it came from.
 * One primary button, Reject as text. Nothing here is clickable or rendered as HTML.
 * @param {{
 *   card: { approvalId: string, kind: string, tool: string, reason?: string,
 *     fields: Record<string, { value: unknown, sources: { type: string, from?: string, date?: string }[] }> },
 *   onDecide?: (action: 'approve' | 'reject') => void,
 *   busy?: boolean,
 *   aside?: import('react').ReactNode, the right end of the header (when it was requested)
 *   children?: import('react').ReactNode,
 * }} props
 */
export function PreviewCard({ card, onDecide, busy = false, aside, children }) {
  const { title, confirm, Icon } = KIND_META[card.kind] ?? KIND_META.action;
  const fields = Object.entries(card.fields ?? {});
  const fromEmail = fields.some(([, field]) =>
    field.sources?.some((source) => source.type === 'email'),
  );

  return (
    <article className="rounded-md bg-surface-2 px-4 py-3">
      <header className="flex items-center gap-2">
        <Icon aria-hidden="true" size={16} className="shrink-0 text-secondary" />
        <h3 className="text-base font-medium">{title}</h3>
        {(card.kind === 'action' || !KIND_META[card.kind]) && (
          <span className="text-sm text-tertiary">{card.tool.replaceAll('_', ' ')}</span>
        )}
        {aside && <span className="ml-auto text-sm text-tertiary">{aside}</span>}
      </header>
      {fields.length > 0 && (
        <dl className="mt-3 space-y-2.5">
          {fields.map(([name, field]) => (
            <div key={name}>
              <dt className="text-sm text-secondary">{labelFor(name)}</dt>
              <dd className="text-base break-words whitespace-pre-wrap">{textOf(field.value)}</dd>
              {field.sources?.length > 0 && (
                <dd className="text-sm text-tertiary">
                  From {field.sources.map(describeSource).join(' and ')}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {(card.reason || fromEmail) && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-secondary">
          <ShieldWarning aria-hidden="true" size={14} className="mt-px shrink-0" />
          <span>
            {card.reason}
            {card.reason && fromEmail ? ' ' : ''}
            {fromEmail && 'Some content comes from an email, so check it before you confirm.'}
          </span>
        </p>
      )}
      {children}
      {onDecide && (
        <footer className="mt-3 flex items-center justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => onDecide('reject')}>
            Reject
          </Button>
          <Button disabled={busy} onClick={() => onDecide('approve')}>
            {confirm}
          </Button>
        </footer>
      )}
    </article>
  );
}

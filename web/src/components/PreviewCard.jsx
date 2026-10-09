import {
  ArrowBendUpLeft,
  CalendarPlus,
  Clock,
  Envelope,
  ShieldWarning,
  TextAlignLeft,
  Users,
  Wrench,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { dateTime } from '../lib/dates.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Button } from './Button.jsx';
import { INPUT_CLASSES } from './FormField.jsx';

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

/** Threading and cleanup arguments of a composer reply: not content, so not shown. */
const HIDDEN_FIELDS = new Set(['in_reply_to', 'thread_id', 'draft_id']);
/** Fields the user may change on a card before approving (user-sourced afterwards). */
const EDITABLE = new Set([
  'to',
  'cc',
  'subject',
  'body',
  'instructions',
  'title',
  'description',
  'start',
  'end',
  'attendees',
]);

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

function SourceLine({ field }) {
  if (!field.sources?.length) return null;
  return (
    <span className="block text-xs text-tertiary">
      From {field.sources.map(describeSource).join(' and ')}
    </span>
  );
}

/** A row of the event layout: icon, then the value (PLAN §15.1 decision 5). */
function EventRow({ Icon, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-secondary" />
      <div className="min-w-0 flex-1 text-base">{children}</div>
    </div>
  );
}

function whenOf(start, end) {
  if (!start) return '';
  const from = dateTime(start);
  if (!end) return from;
  const to = new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${from} to ${to}`;
}

/**
 * The preview of an action waiting for the user (PRD F8.3, PLAN §15.1 decision 6): the exact
 * content as plain text with, under every value, where it came from. Events read like an
 * invitation (title, when, who, what); mail reads like mail. **Edit** turns the fields into
 * inputs; edited values become the user's own words through `onEdit`. One primary button,
 * Reject as text. Nothing here is clickable or rendered as HTML.
 * @param {{
 *   card: { approvalId: string, kind: string, tool: string, reason?: string,
 *     fields: Record<string, { value: unknown, sources: { type: string, from?: string, date?: string }[] }> },
 *   onDecide?: (action: 'approve' | 'reject') => void,
 *   onEdit?: (changes: Record<string, unknown>) => Promise<void>,
 *   busy?: boolean,
 *   aside?: import('react').ReactNode, the right end of the header (when it was requested)
 *   children?: import('react').ReactNode,
 * }} props
 */
export function PreviewCard({ card, onDecide, onEdit, busy = false, aside, children }) {
  const meta = KIND_META[card.kind] ?? KIND_META.action;
  // A send that answers an email is a reply to the user, with Send as its one action.
  const isReply = card.kind === 'email' && card.fields?.in_reply_to !== undefined;
  const { title, confirm, Icon } = isReply
    ? { title: 'Reply', confirm: 'Send', Icon: ArrowBendUpLeft }
    : meta;
  const fields = Object.entries(card.fields ?? {}).filter(([name]) => !HIDDEN_FIELDS.has(name));
  const fromEmail = fields.some(([, field]) =>
    field.sources?.some((source) => source.type === 'email'),
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [error, setError] = useState(null);
  const field = (name) => card.fields?.[name];
  const value = (name) => draft[name] ?? textOf(field(name)?.value);

  async function save() {
    setError(null);
    const changes = {};
    for (const [name, text] of Object.entries(draft)) {
      const original = field(name)?.value;
      const next = Array.isArray(original)
        ? text
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
        : text.trim();
      if (textOf(next) !== textOf(original)) changes[name] = next;
    }
    try {
      if (Object.keys(changes).length > 0) await onEdit(changes);
      setEditing(false);
      setDraft({});
    } catch (caught) {
      setError(caught.message);
    }
  }

  const input = (name, { multiline = false } = {}) => {
    const common = {
      id: `${card.approvalId}-${name}`,
      'aria-label': labelFor(name),
      value: value(name),
      onChange: (event) => setDraft((d) => ({ ...d, [name]: event.target.value })),
      className: `${INPUT_CLASSES} ${multiline ? 'min-h-24 resize-y' : ''}`,
    };
    return multiline ? <textarea rows={5} {...common} /> : <input type="text" {...common} />;
  };

  const eventLayout = card.kind === 'event';
  return (
    <article className="ask-card px-4 py-3.5">
      <header className="flex items-center gap-2">
        {eventLayout ? (
          editing ? (
            input('title')
          ) : (
            <h3 className="min-w-0 flex-1 truncate text-md font-medium">
              {value('title') || title}
            </h3>
          )
        ) : (
          <>
            <Icon aria-hidden="true" size={16} className="shrink-0 text-secondary" />
            <h3 className="text-base font-medium">{title}</h3>
            {(card.kind === 'action' || !KIND_META[card.kind]) && (
              <span className="text-sm text-tertiary">{card.tool.replaceAll('_', ' ')}</span>
            )}
          </>
        )}
        {aside && <span className="ml-auto text-sm text-tertiary">{aside}</span>}
      </header>

      {eventLayout ? (
        <div className="mt-3 space-y-2.5">
          {editing ? (
            <>
              <EventRow Icon={Clock}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {input('start')}
                  {input('end')}
                </div>
              </EventRow>
              <EventRow Icon={Users}>{input('attendees')}</EventRow>
              <EventRow Icon={TextAlignLeft}>{input('description', { multiline: true })}</EventRow>
            </>
          ) : (
            <>
              <EventRow Icon={Clock}>
                {whenOf(field('start')?.value, field('end')?.value)}
                <SourceLine field={field('start') ?? {}} />
              </EventRow>
              {Array.isArray(field('attendees')?.value) && (
                <EventRow Icon={Users}>
                  <ul className="space-y-1">
                    {field('attendees').value.map((address) => (
                      <li key={address} className="flex items-center gap-2">
                        <Avatar name={address} hueKey={address} size="sm" />
                        <span className="truncate">{address}</span>
                      </li>
                    ))}
                  </ul>
                </EventRow>
              )}
              {field('description')?.value && (
                <EventRow Icon={TextAlignLeft}>
                  <span className="break-words whitespace-pre-wrap">
                    {textOf(field('description').value)}
                  </span>
                </EventRow>
              )}
            </>
          )}
        </div>
      ) : (
        fields.length > 0 && (
          <dl className="mt-3 space-y-2.5">
            {fields.map(([name, item]) => (
              <div key={name}>
                <dt className="text-sm text-secondary">{labelFor(name)}</dt>
                <dd className="text-base break-words whitespace-pre-wrap">
                  {editing && EDITABLE.has(name)
                    ? input(name, { multiline: name === 'body' })
                    : textOf(item.value)}
                </dd>
                <dd>
                  <SourceLine field={item} />
                </dd>
              </div>
            ))}
          </dl>
        )
      )}

      {(card.reason || fromEmail) && !editing && (
        <p className="mt-3 flex items-start gap-1.5 text-sm text-secondary">
          <ShieldWarning aria-hidden="true" size={14} className="mt-px shrink-0" />
          <span>
            {card.reason}
            {card.reason && fromEmail ? ' ' : ''}
            {fromEmail && 'Some content comes from an email, so check it before you confirm.'}
          </span>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {children}
      {(onDecide || (onEdit && editing)) && (
        <footer className="mt-3 flex items-center justify-end gap-2">
          {editing ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft({});
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={save}>Done</Button>
            </>
          ) : (
            <>
              {onDecide && (
                <Button variant="ghost" disabled={busy} onClick={() => onDecide('reject')}>
                  Reject
                </Button>
              )}
              {onEdit && (
                <Button variant="secondary" disabled={busy} onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              {onDecide && (
                <Button disabled={busy} onClick={() => onDecide('approve')}>
                  {confirm}
                </Button>
              )}
            </>
          )}
        </footer>
      )}
    </article>
  );
}

import { Check, CircleDashed, CircleNotch, ShieldSlash } from '@phosphor-icons/react';
import { Link } from 'react-router';
import { sourcesOf } from '../../lib/chatTurn.js';
import { PreviewCard } from '../PreviewCard.jsx';

const STEP_ICONS = {
  running: { Icon: CircleNotch, className: 'animate-spin text-accent' },
  done: { Icon: Check, className: 'text-secondary' },
  pending: { Icon: CircleDashed, className: 'text-secondary' },
  denied: { Icon: ShieldSlash, className: 'text-secondary' },
};

function describeItem(item) {
  if (item === null || item === undefined) return '';
  if (typeof item !== 'object') return String(item);
  const parts = [];
  if (item.from?.address) parts.push(item.from.address);
  if (item.date) parts.push(String(item.date).slice(0, 10));
  if (item.risk?.level) parts.push(item.risk.level.toLowerCase());
  if (item.summary) parts.push(item.summary);
  return parts.length > 0 ? parts.join(' · ') : JSON.stringify(item);
}

/** A tool result (F8.7): plain text in a quiet block, labelled when it came from emails. */
function Result({ result }) {
  const { value, untrusted, tool } = result;
  const items = Array.isArray(value) ? value : null;
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2 text-sm">
      <p className="flex items-center gap-2 text-xs text-secondary">
        <span>{tool.replaceAll('_', ' ')}</span>
        {untrusted && <span className="ml-auto">from untrusted email content</span>}
      </p>
      {items ? (
        items.length === 0 ? (
          <p className="mt-1 text-secondary">No results.</p>
        ) : (
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {items.slice(0, 10).map((item, index) => (
              <li key={index} className="break-words whitespace-pre-wrap">
                {describeItem(item)}
              </li>
            ))}
            {items.length > 10 && <li className="text-secondary">and {items.length - 10} more</li>}
          </ul>
        )
      ) : (
        <p className="mt-1 break-words whitespace-pre-wrap">{describeItem(value)}</p>
      )}
    </div>
  );
}

/** "email from X on date", or just the email when the server knew no more about it. */
export function describeSource(source) {
  if (!source.from) return 'an email';
  return `email from ${source.from}${source.date ? ` on ${String(source.date).slice(0, 10)}` : ''}`;
}

/**
 * One turn of the Ask AI panel (PLAN §13.9). Your words are a quiet block on the right; the
 * answer is plain text with its steps, results, cards and numbered sources under it. Decided
 * cards lose their buttons.
 * @param {{
 *   message: { role: 'user' | 'assistant', content: object },
 *   decided?: Set<string>,
 *   onDecide?: (approvalId: string, action: 'approve' | 'reject') => void,
 *   busy?: boolean,
 *   live?: boolean,
 * }} props
 */
export function AskTurn({ message, decided = new Set(), onDecide, busy = false, live = false }) {
  const { role, content } = message;
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-md bg-surface-3 px-3 py-2 text-base break-words whitespace-pre-wrap">
          {content.text}
        </p>
      </div>
    );
  }

  // A decision recorded by the chat (Send / Save / Discard on a card).
  if (content.approvalId && content.steps?.length === 0 && !content.cards?.length) {
    return (
      <p className={`text-sm ${content.status === 'denied' ? 'text-danger' : 'text-secondary'}`}>
        {content.text}
      </p>
    );
  }

  const steps = content.steps ?? [];
  const results = content.results ?? [];
  const cards = content.cards ?? [];
  const sources = sourcesOf(content);
  return (
    <div className="flex flex-col gap-2">
      {steps.length > 0 && (
        <ol className="space-y-1" aria-label="Steps">
          {steps.map((step) => {
            const { Icon, className } = STEP_ICONS[step.status] ?? STEP_ICONS.done;
            return (
              <li key={step.step} className="flex items-center gap-2 text-sm text-secondary">
                <Icon aria-hidden="true" size={14} className={className} />
                <span>{step.label}</span>
                {step.status === 'denied' && step.reason && (
                  <span className="text-danger">{step.reason}</span>
                )}
                {step.status === 'pending' && <span>waiting for your approval</span>}
              </li>
            );
          })}
        </ol>
      )}
      {results.map((result, index) => (
        <Result key={index} result={result} />
      ))}
      {cards.map((card) => (
        <PreviewCard
          key={card.approvalId}
          card={card}
          busy={busy}
          onDecide={
            onDecide && !decided.has(card.approvalId)
              ? (action) => onDecide(card.approvalId, action)
              : undefined
          }
        />
      ))}
      {live && content.statusText && !content.text && (
        <p className="flex items-center gap-2 text-sm text-secondary">
          <CircleNotch aria-hidden="true" size={14} className="animate-spin" /> {content.statusText}
        </p>
      )}
      {content.text && (
        <div className="text-base">
          <p className="break-words whitespace-pre-wrap">{content.text}</p>
          {content.status === 'failed' && (
            <p className="mt-1 text-sm text-danger">Nothing was run.</p>
          )}
          {sources.length > 0 && (
            <ol aria-label="Sources" className="mt-2 space-y-0.5 text-sm text-secondary">
              {sources.map((source, index) => (
                <li key={source.id ?? index} className="flex gap-1.5">
                  <span className="shrink-0 tabular-nums">{index + 1}.</span>
                  {source.id ? (
                    <Link to={`/inbox/${source.id}`} className="truncate hover:underline">
                      {describeSource(source)}
                    </Link>
                  ) : (
                    <span className="truncate">{describeSource(source)}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

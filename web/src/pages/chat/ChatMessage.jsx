import { Check, CircleDashed, LoaderCircle, ShieldOff, Sparkles, User } from 'lucide-react';
import { PreviewCard } from '../../components/PreviewCard.jsx';

const STEP_ICONS = {
  running: { Icon: LoaderCircle, className: 'animate-spin text-accent' },
  done: { Icon: Check, className: 'text-safe' },
  pending: { Icon: CircleDashed, className: 'text-warn' },
  denied: { Icon: ShieldOff, className: 'text-danger' },
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

/** A tool result shown in chat (F8.7): plain text, labelled when it came from emails. */
function Result({ result }) {
  const { value, untrusted, tool } = result;
  const items = Array.isArray(value) ? value : null;
  return (
    <div className="rounded-md border border-line bg-surface-2/60 p-2 text-sm">
      <p className="mb-1 flex items-center gap-1 text-xs text-muted">
        <span className="font-mono">{tool}</span>
        {untrusted && (
          <span className="ml-auto inline-flex items-center gap-1">
            <Sparkles aria-hidden="true" className="size-3" /> from untrusted email content
          </span>
        )}
      </p>
      {items ? (
        items.length === 0 ? (
          <p className="text-muted">No results.</p>
        ) : (
          <ul className="list-disc space-y-0.5 pl-5">
            {items.slice(0, 10).map((item, index) => (
              <li key={index} className="break-words whitespace-pre-wrap">
                {describeItem(item)}
              </li>
            ))}
            {items.length > 10 && <li className="text-muted">and {items.length - 10} more</li>}
          </ul>
        )
      ) : (
        <p className="break-words whitespace-pre-wrap">{describeItem(value)}</p>
      )}
    </div>
  );
}

/**
 * One chat turn. The user's text is their own; the assistant's reply is plain text with its
 * steps, results and preview cards (PRD F8.2–F8.4, F8.7). Decided cards lose their buttons.
 * @param {{
 *   message: { role: 'user' | 'assistant', content: object, createdAt?: string },
 *   decided?: Set<string>,
 *   onDecide?: (approvalId: string, action: 'approve' | 'reject') => void,
 *   busy?: boolean,
 *   live?: boolean,
 * }} props
 */
export function ChatMessage({
  message,
  decided = new Set(),
  onDecide,
  busy = false,
  live = false,
}) {
  const { role, content } = message;
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[80%] items-start gap-2 rounded-2xl rounded-br-sm bg-accent px-4 py-2 text-sm text-accent-fg">
          <p className="whitespace-pre-wrap break-words">{content.text}</p>
          <User aria-hidden="true" className="mt-0.5 size-4 shrink-0 opacity-70" />
        </div>
      </div>
    );
  }

  // A decision recorded by the chat (Send / Save / Discard on a card).
  if (content.approvalId && content.steps?.length === 0 && !content.cards?.length) {
    return (
      <p className={`text-sm ${content.status === 'denied' ? 'text-danger' : 'text-muted'}`}>
        {content.text}
      </p>
    );
  }

  const steps = content.steps ?? [];
  const results = content.results ?? [];
  const cards = content.cards ?? [];
  return (
    <div className="flex max-w-[90%] flex-col gap-2">
      {steps.length > 0 && (
        <ol className="space-y-1" aria-label="Steps">
          {steps.map((step) => {
            const { Icon, className } = STEP_ICONS[step.status] ?? STEP_ICONS.done;
            return (
              <li key={step.step} className="flex items-center gap-2 text-sm text-muted">
                <Icon aria-hidden="true" className={`size-4 ${className}`} />
                <span>{step.label}</span>
                {step.status === 'denied' && step.reason && (
                  <span className="text-danger">{step.reason}</span>
                )}
                {step.status === 'pending' && (
                  <span className="text-warn">waiting for your approval</span>
                )}
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
        <p className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> {content.statusText}
        </p>
      )}
      {content.text && (
        <div className="rounded-2xl rounded-bl-sm bg-surface-2 px-4 py-2 text-sm">
          <p className="whitespace-pre-wrap break-words">{content.text}</p>
          {content.status === 'failed' && (
            <p className="mt-1 text-xs text-danger">Nothing was run.</p>
          )}
        </div>
      )}
    </div>
  );
}

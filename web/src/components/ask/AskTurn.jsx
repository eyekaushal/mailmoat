import { EmailListResult } from './EmailListResult.jsx';
import { PreviewCard } from '../PreviewCard.jsx';

/** "email from X on date", or just the email when the server knew no more about it. */
export function describeSource(source) {
  if (!source.from) return 'an email';
  return `email from ${source.from}${source.date ? ` on ${String(source.date).slice(0, 10)}` : ''}`;
}

function firstEmailSource(sources) {
  return (sources ?? []).find((source) => source.type === 'email');
}

/**
 * One turn of Ask AI (PLAN §15.1 decisions 3–7). Your words in a light tint on the right; the
 * progress line while the plan runs; then only what the ask needs: an email list, a summary, a
 * card, and the answer line composed by code. No steps, no raw data.
 * @param {{
 *   message: { role: 'user' | 'assistant', content: object },
 *   decided?: Set<string>,
 *   onDecide?: (approvalId: string, action: 'approve' | 'reject') => void,
 *   onEdit?: (approvalId: string, changes: Record<string, unknown>) => Promise<void>,
 *   busy?: boolean,
 *   live?: boolean,
 * }} props
 */
export function AskTurn({
  message,
  decided = new Set(),
  onDecide,
  onEdit,
  busy = false,
  live = false,
}) {
  const { role, content } = message;
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-xl bg-accent-soft px-3.5 py-2 text-base break-words whitespace-pre-wrap">
          {content.text}
        </p>
      </div>
    );
  }

  // The line under a card once its button was clicked (Done! …, Discarded.).
  if (content.approvalId && !content.cards?.length) {
    return (
      <p
        className={`text-base font-medium ${content.status === 'denied' ? 'text-danger' : 'text-accent'}`}
      >
        {content.text}
      </p>
    );
  }

  const results = content.results ?? [];
  const cards = content.cards ?? [];
  const progress = live ? content.statusText || content.progress : '';
  return (
    <div className="flex flex-col gap-3">
      {progress && (
        <p className="ask-progress text-base font-medium text-accent" role="status">
          {progress}
        </p>
      )}
      {results.map((result, index) => {
        if (result.kind === 'emails') {
          return <EmailListResult key={index} ids={result.value?.ids ?? []} />;
        }
        if (result.kind === 'summary') {
          const source = firstEmailSource(result.sources);
          return (
            <div key={index} className="rounded-md bg-surface-2 px-3.5 py-2.5 text-base">
              <p className="break-words whitespace-pre-wrap">{result.value?.summary ?? ''}</p>
              <p className="mt-1.5 text-xs text-secondary">
                AI summary of {source ? `an ${describeSource(source)}` : 'an email'}, unverified
              </p>
            </div>
          );
        }
        if (result.kind === 'value') {
          return (
            <p key={index} className="text-sm text-secondary">
              From the email:{' '}
              {String(Array.isArray(result.value) ? result.value.join(', ') : result.value)}
            </p>
          );
        }
        return null;
      })}
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
          onEdit={
            onEdit && !decided.has(card.approvalId)
              ? (changes) => onEdit(card.approvalId, changes)
              : undefined
          }
        />
      ))}
      {!live && content.text && (
        <p
          className={`text-base font-medium ${content.status === 'failed' ? 'text-danger' : 'text-accent'}`}
        >
          {content.text}
        </p>
      )}
    </div>
  );
}

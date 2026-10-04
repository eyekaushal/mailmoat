import { dateTime } from '../lib/dates.js';
import { PreviewCard } from './PreviewCard.jsx';

/** Which preview a pending tool call gets (mirrors the chat's card kinds). */
const CARD_KINDS = {
  send_email: 'email',
  create_draft: 'email',
  reply: 'reply',
  create_calendar_event: 'event',
};

const STATUS_WORDS = {
  PENDING: null,
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  DENIED: 'Refused',
  EXPIRED: 'Expired',
};

/**
 * One card of the Approvals page: a stored ASK decision as a preview card, with when it was
 * requested and, once decided, its outcome in the header.
 * @param {{
 *   approval: { id: string, tool: string, status: string, reason?: string, requestedAt: string,
 *     args: Record<string, { value: unknown, sources: { type: string, id?: string }[] }> },
 *   onDecide?: (action: 'approve' | 'reject') => void,
 *   busy?: boolean,
 *   now?: Date,
 * }} props
 */
export function ApprovalCard({ approval, onDecide, busy, now }) {
  const card = {
    approvalId: approval.id,
    kind: CARD_KINDS[approval.tool] ?? 'action',
    tool: approval.tool,
    reason: approval.reason,
    fields: Object.fromEntries(
      Object.entries(approval.args ?? {}).map(([name, arg]) => [
        name,
        { value: arg.value, sources: arg.sources ?? [] },
      ]),
    ),
  };
  const pending = approval.status === 'PENDING';
  const status =
    approval.status in STATUS_WORDS ? STATUS_WORDS[approval.status] : approval.status.toLowerCase();
  return (
    <PreviewCard
      card={card}
      onDecide={pending ? onDecide : undefined}
      busy={busy}
      aside={
        <>
          {status && <span className="mr-2 text-secondary">{status}</span>}
          <time dateTime={approval.requestedAt}>{dateTime(approval.requestedAt, now)}</time>
        </>
      }
    />
  );
}

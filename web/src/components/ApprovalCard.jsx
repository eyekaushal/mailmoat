import { PreviewCard } from './PreviewCard.jsx';

/** Which preview a pending tool call gets (mirrors the chat's card kinds). */
const CARD_KINDS = {
  send_email: 'email',
  create_draft: 'email',
  reply: 'reply',
  create_calendar_event: 'event',
};

/**
 * One row of the Approvals page: a stored ASK decision shown as a preview card with when it was
 * requested and its current status.
 * @param {{
 *   approval: { id: string, tool: string, status: string, reason?: string, requestedAt: string,
 *     args: Record<string, { value: unknown, sources: { type: string, id?: string }[] }> },
 *   onDecide?: (action: 'approve' | 'reject') => void,
 *   busy?: boolean,
 * }} props
 */
export function ApprovalCard({ approval, onDecide, busy }) {
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
  return (
    <div>
      <p className="mb-1 flex items-center gap-2 text-xs text-muted">
        <time dateTime={approval.requestedAt}>
          Requested {new Date(approval.requestedAt).toLocaleString()}
        </time>
        {!pending && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium uppercase">
            {approval.status.toLowerCase()}
          </span>
        )}
      </p>
      <PreviewCard card={card} onDecide={pending ? onDecide : undefined} busy={busy} />
    </div>
  );
}

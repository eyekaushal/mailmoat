import { CheckCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { ApprovalCard } from '../../components/ApprovalCard.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { useApi, useApiClient } from '../../lib/useApi.js';

/**
 * PRD §8 Approvals, PLAN §13.7: every ASK decision waiting for the user as a quiet card.
 * Approving re-runs the Policy Engine on the stored call, so a refusal here is possible and
 * is reported in place.
 */
export function ApprovalsPage() {
  const client = useApiClient();
  const { data: approvals, error, mutate } = useApi('/approvals', { refreshInterval: 15_000 });
  const [busy, setBusy] = useState(null);
  const [outcomes, setOutcomes] = useState([]);

  async function decide(approval, action) {
    setBusy(approval.id);
    const name = approval.tool.replaceAll('_', ' ');
    try {
      const result = await client.post(`/approvals/${approval.id}/${action}`);
      const text =
        result.status === 'performed'
          ? `${name}: done.`
          : result.status === 'denied'
            ? `${name}: refused by the Policy Engine. ${result.reason}`
            : `${name}: rejected.`;
      setOutcomes((list) =>
        [{ id: approval.id, ok: result.status !== 'denied', text }, ...list].slice(0, 5),
      );
      await mutate();
    } catch (caught) {
      setOutcomes((list) =>
        [{ id: approval.id, ok: false, text: caught.message }, ...list].slice(0, 5),
      );
    } finally {
      setBusy(null);
    }
  }

  const count = approvals?.length ?? 0;
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-5">
        <h1 className="text-xl font-medium tracking-tight">Approvals</h1>
        {count > 0 && <span className="text-xl text-tertiary tabular-nums">{count}</span>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-5 py-4">
        <div className="max-w-2xl space-y-4">
          <p className="text-base text-secondary">
            Drafts, sends, events and other actions that wait for your click. Nothing here has
            happened yet.
          </p>
          {outcomes.length > 0 && (
            <ul className="space-y-1" aria-label="Recent decisions">
              {outcomes.map((outcome, index) => (
                <li
                  key={`${outcome.id}-${index}`}
                  role="status"
                  className={`text-sm ${outcome.ok ? 'text-secondary' : 'text-danger'}`}
                >
                  {outcome.text}
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error.message}
            </p>
          )}
          {!approvals && !error && <LoadingState label="Loading approvals…" />}
          {approvals && approvals.length === 0 && (
            <EmptyState
              icon={CheckCircle}
              title="Nothing to approve"
              description="When the assistant wants to send, draft or schedule something, it shows up here first."
            />
          )}
          {approvals && approvals.length > 0 && (
            <ul className="space-y-3">
              {approvals.map((approval) => (
                <li key={approval.id}>
                  <ApprovalCard
                    approval={approval}
                    busy={busy === approval.id}
                    onDecide={(action) => decide(approval, action)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

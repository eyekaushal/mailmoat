import { CheckSquare } from '@phosphor-icons/react';
import { useState } from 'react';
import { ApprovalCard } from '../../components/ApprovalCard.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { useApi, useApiClient } from '../../lib/useApi.js';

/**
 * PRD §8 Approvals: every ASK decision waiting for the user. Approving re-runs the Policy Engine
 * on the stored call, so a DENY here is possible and shown.
 */
export function ApprovalsPage() {
  const client = useApiClient();
  const { data: approvals, error, mutate } = useApi('/approvals', { refreshInterval: 15_000 });
  const [busy, setBusy] = useState(null);
  const [outcomes, setOutcomes] = useState([]);

  async function decide(approval, action) {
    setBusy(approval.id);
    try {
      const result = await client.post(`/approvals/${approval.id}/${action}`);
      const text =
        result.status === 'performed'
          ? `${approval.tool.replaceAll('_', ' ')}: done.`
          : result.status === 'denied'
            ? `${approval.tool.replaceAll('_', ' ')}: refused by the Policy Engine. ${result.reason}`
            : `${approval.tool.replaceAll('_', ' ')}: rejected.`;
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Approvals</h1>
        <p className="mt-1 text-sm text-muted">
          Drafts, sends, events and other actions that wait for your click. Nothing here has
          happened yet.
        </p>
      </header>
      {outcomes.length > 0 && (
        <ul className="space-y-1" aria-label="Recent decisions">
          {outcomes.map((outcome, index) => (
            <li
              key={`${outcome.id}-${index}`}
              role="status"
              className={`text-sm ${outcome.ok ? 'text-safe' : 'text-danger'}`}
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
          icon={CheckSquare}
          title="Nothing to approve"
          description="When the assistant wants to send, draft or schedule something, it shows up here first."
        />
      )}
      {approvals && approvals.length > 0 && (
        <ul className="space-y-4">
          {approvals.map((approval) => (
            <li key={approval.id}>
              <ApprovalCard
                approval={approval}
                busy={busy === approval.id}
                onDecide={(action) => decide(approval, action === 'approve' ? 'approve' : 'reject')}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

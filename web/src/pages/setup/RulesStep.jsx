import { Lock } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { useApi, useApiClient } from '../../lib/useApi.js';

const ACTION_LABELS = {
  label: 'Label',
  archive: 'Archive',
  draft_reply: 'Draft reply',
  alert: 'Alert',
  log: 'Log',
};

/**
 * Wizard step 3 (PRD F1, F4.1): choose which predefined rules are on. Security rules are always
 * on and shown locked; actions are edited later on the Assistant page.
 * @param {{ onFinish: () => void }} props
 */
export function RulesStep({ onFinish }) {
  const client = useApiClient();
  const { data: rules, mutate, error } = useApi('/rules');
  const [pending, setPending] = useState(null);
  const [failure, setFailure] = useState(null);

  async function toggle(rule) {
    setPending(rule.id);
    setFailure(null);
    try {
      const updated = await client.patch(`/rules/${rule.id}`, { enabled: !rule.enabled });
      await mutate(
        rules.map((r) => (r.id === rule.id ? updated : r)),
        { revalidate: false },
      );
    } catch (caught) {
      setFailure(caught.message);
    } finally {
      setPending(null);
    }
  }

  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error.message}
      </p>
    );
  if (!rules) return <LoadingState label="Loading rules…" />;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Choose your rules</h2>
        <p className="mt-1 text-sm text-muted">
          mailmoat sorts incoming mail into Gmail labels using these rules. Rules are matched by
          code from typed fields, never by free text. You can change actions later under Assistant.
        </p>
      </header>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                {rule.name}
                {rule.isSecurity && (
                  <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
                    <Lock aria-hidden="true" className="size-3" /> always on
                  </span>
                )}
              </p>
              <p className="text-sm text-muted">{rule.description}</p>
            </div>
            <div className="hidden gap-1 sm:flex">
              {rule.actions.map((action) => (
                <span
                  key={action}
                  className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent"
                >
                  {ACTION_LABELS[action] ?? action}
                </span>
              ))}
            </div>
            <input
              type="checkbox"
              role="switch"
              aria-label={`${rule.name} enabled`}
              checked={rule.enabled}
              disabled={rule.isSecurity || pending === rule.id}
              onChange={() => toggle(rule)}
              className="size-4 accent-accent"
            />
          </li>
        ))}
      </ul>
      {failure && (
        <p role="alert" className="text-sm text-danger">
          {failure}
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={onFinish}>Finish setup</Button>
      </div>
    </div>
  );
}

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
const JOB_POLL_MS = 1500;

/**
 * PRD F4.1/F4.2/F4.5: every rule with its toggle and allowed actions, plus "Process past emails".
 */
export function RulesTab() {
  const client = useApiClient();
  const { data: rules, mutate, error } = useApi('/rules');
  const [failure, setFailure] = useState(null);
  const [pending, setPending] = useState(null);

  async function patch(rule, changes) {
    setPending(rule.id);
    setFailure(null);
    try {
      const updated = await client.patch(`/rules/${rule.id}`, changes);
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
      <p className="text-sm text-muted">
        Rules match on the typed fields the Reader returns, in code, never on free text. A
        suspicious or dangerous email gets no assistant actions at all. There is no “Add rule” in
        v1.
      </p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {rules.map((rule) => (
          <li key={rule.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <input
              type="checkbox"
              role="switch"
              aria-label={`${rule.name} enabled`}
              checked={rule.enabled}
              disabled={rule.isSecurity || pending === rule.id}
              onChange={() => patch(rule, { enabled: !rule.enabled })}
              className="size-4 accent-accent"
            />
            <div className="min-w-0 flex-1 basis-48">
              <p className="flex items-center gap-2 text-sm font-medium">
                {rule.name}
                {rule.isSecurity && (
                  <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
                    <Lock aria-hidden="true" className="size-3" /> security, always on
                  </span>
                )}
              </p>
              <p className="text-sm text-muted">{rule.description}</p>
            </div>
            <fieldset className="flex flex-wrap gap-1.5" aria-label={`${rule.name} actions`}>
              {rule.allowedActions.map((action) => {
                const on = rule.actions.includes(action);
                const locked = rule.isSecurity || pending === rule.id;
                return (
                  <label
                    key={action}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${
                      on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted'
                    } ${locked ? 'cursor-default opacity-70' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      disabled={locked}
                      onChange={() =>
                        patch(rule, {
                          actions: on
                            ? rule.actions.filter((a) => a !== action)
                            : [...rule.actions, action],
                        })
                      }
                    />
                    {ACTION_LABELS[action] ?? action}
                  </label>
                );
              })}
            </fieldset>
          </li>
        ))}
      </ul>
      {failure && (
        <p role="alert" className="text-sm text-danger">
          {failure}
        </p>
      )}
      <ProcessPast />
    </div>
  );
}

function ProcessPast() {
  const client = useApiClient();
  const [days, setDays] = useState(7);
  const [running, setRunning] = useState(false);
  const { data: job, mutate } = useApi('/rules/process-past', {
    refreshInterval: running ? JOB_POLL_MS : 0,
    onSuccess: (data) => {
      if (data?.status !== 'running') setRunning(false);
    },
  });

  async function start() {
    setRunning(true);
    await mutate(await client.post('/rules/process-past', { days }), { revalidate: false });
  }

  const percent = job?.total ? Math.round((job.done / job.total) * 100) : 0;
  return (
    <section className="rounded-lg border border-line p-4">
      <h3 className="text-sm font-semibold">Process past emails</h3>
      <p className="mt-0.5 text-sm text-muted">
        Runs the rules on recent mail. Already-analysed emails reuse their stored result; only
        never-seen mail goes through the Reader.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          Last
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-20 rounded-md border border-line bg-surface px-2 py-1 text-sm"
          />
          days
        </label>
        <Button onClick={start} disabled={running || job?.status === 'running'}>
          {running || job?.status === 'running' ? 'Processing…' : 'Process'}
        </Button>
      </div>
      {job && job.status !== 'idle' && (
        <div className="mt-3 space-y-1">
          {job.status === 'running' && (
            <>
              <div
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 overflow-hidden rounded-full bg-surface-2"
              >
                <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
              </div>
              <p className="text-xs text-muted">
                {job.done} of {job.total || '…'} emails
              </p>
            </>
          )}
          {job.status === 'done' && (
            <p role="status" className="text-sm text-safe">
              Done: {job.done} emails processed.
            </p>
          )}
          {job.status === 'failed' && (
            <p role="alert" className="text-sm text-danger">
              Failed: {job.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

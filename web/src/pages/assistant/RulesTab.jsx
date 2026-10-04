import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { FormField, INPUT_CLASSES } from '../../components/FormField.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { useApi, useApiClient } from '../../lib/useApi.js';
import { ActionChip } from '../../ui/ActionChip.jsx';
import { Dialog } from '../../ui/Dialog.jsx';
import { Switch } from '../../ui/Switch.jsx';
import { Tooltip } from '../../ui/Tooltip.jsx';

const JOB_POLL_MS = 1500;

/**
 * PRD F4.1/F4.2/F4.5 on the Inbox Zero table (PLAN §13.7): Enabled switch · Name · Description ·
 * action chips, column for column. Security rules are locked: their switch is on and disabled
 * with a lock, their chips cannot be toggled. "Process past emails" is a quiet button.
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
      <p role="alert" className="px-5 py-4 text-sm text-danger">
        {error.message}
      </p>
    );
  if (!rules) return <LoadingState label="Loading rules…" />;

  return (
    <div>
      <div className="flex items-center gap-4 px-5 py-3">
        <p className="min-w-0 flex-1 text-base text-secondary">
          Rules match the typed fields the Reader returns, in code, never free text. Flagged mail
          gets no assistant actions.
        </p>
        <ProcessPast />
      </div>
      <table className="w-full border-t border-line">
        <thead>
          <tr className="h-9 text-left text-sm font-normal text-secondary">
            <th className="w-20 pl-5 font-normal">
              <span className="sr-only">Enabled</span>
            </th>
            <th className="pr-4 font-normal">Rule</th>
            <th className="w-full pr-4 font-normal">Description</th>
            <th className="pr-5 font-normal">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-t border-line">
          {rules.map((rule) => {
            const locked = rule.isSecurity;
            const toggle = (
              <Switch
                aria-label={`${rule.name} enabled`}
                checked={rule.enabled}
                locked={locked}
                disabled={pending === rule.id}
                onCheckedChange={(enabled) => patch(rule, { enabled })}
              />
            );
            return (
              <tr key={rule.id} className="h-12 align-middle">
                <td className="pr-3 pl-5">
                  {locked ? <Tooltip label="Security rule, always on">{toggle}</Tooltip> : toggle}
                </td>
                <td className="pr-4 font-medium whitespace-nowrap">{rule.name}</td>
                <td className="max-w-0 truncate pr-4 text-secondary">{rule.description}</td>
                <td className="pr-5 whitespace-nowrap">
                  <div
                    role="group"
                    aria-label={`${rule.name} actions`}
                    className="flex items-center gap-1.5"
                  >
                    {rule.allowedActions.map((action) => {
                      const on = rule.actions.includes(action);
                      return (
                        <ActionChip
                          key={action}
                          action={action}
                          selected={on}
                          disabled={locked || pending === rule.id}
                          title={locked ? 'Security rule, actions fixed' : undefined}
                          onToggle={() =>
                            patch(rule, {
                              actions: on
                                ? rule.actions.filter((a) => a !== action)
                                : [...rule.actions, action],
                            })
                          }
                        />
                      );
                    })}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {failure && (
        <p role="alert" className="px-5 py-3 text-sm text-danger">
          {failure}
        </p>
      )}
    </div>
  );
}

/**
 * "Process past emails" (F4.5): a quiet button, a small dialog for the day count, and one status
 * line while the job runs. Already-analysed mail reuses its stored result.
 */
function ProcessPast() {
  const client = useApiClient();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState(null);
  const { data: job, mutate } = useApi('/rules/process-past', {
    refreshInterval: running ? JOB_POLL_MS : 0,
    onSuccess: (data) => {
      if (data?.status !== 'running') setRunning(false);
    },
  });

  async function start() {
    setOpen(false);
    setFailure(null);
    setRunning(true);
    try {
      await mutate(await client.post('/rules/process-past', { days }), { revalidate: false });
    } catch (caught) {
      setRunning(false);
      setFailure(caught.message);
    }
  }

  const active = running || job?.status === 'running';
  const percent = job?.total ? Math.round((job.done / job.total) * 100) : 0;
  return (
    <div className="flex shrink-0 items-center gap-3">
      {active && (
        <span className="flex items-center gap-2 text-sm text-secondary">
          <span
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1 w-24 overflow-hidden rounded-full bg-surface-3"
          >
            <span
              className="block h-full bg-accent transition-all"
              style={{ width: `${percent}%` }}
            />
          </span>
          {job?.done ?? 0} of {job?.total || '…'}
        </span>
      )}
      {!active && job?.status === 'done' && (
        <span role="status" className="text-sm text-secondary">
          Done: {job.done} emails processed.
        </span>
      )}
      {!active && (failure || job?.status === 'failed') && (
        <span role="alert" className="text-sm text-danger">
          Failed: {failure ?? job.error}
        </span>
      )}
      <Button variant="ghost" onClick={() => setOpen(true)} disabled={active}>
        {active ? 'Processing…' : 'Process past emails'}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Process past emails"
        description="Runs the rules on recent mail. Already-analysed emails reuse their stored result; only never-seen mail goes through the Reader."
        actions={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={start} disabled={!(days >= 1 && days <= 365)}>
              Process
            </Button>
          </>
        }
      >
        <FormField label="Last how many days?">
          {(id) => (
            <input
              id={id}
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className={`${INPUT_CLASSES} w-28`}
            />
          )}
        </FormField>
      </Dialog>
    </div>
  );
}

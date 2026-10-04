import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { useApi, useApiClient } from '../../lib/useApi.js';
import { ActionChip } from '../../ui/ActionChip.jsx';
import { Switch } from '../../ui/Switch.jsx';
import { Tooltip } from '../../ui/Tooltip.jsx';

/**
 * Wizard step 3 (PRD F1, F4.1) on the Assistant's table: switch · name · description · action
 * chips. Security rules are always on and shown locked; actions are edited later under Assistant.
 * @param {{ onFinish: () => void }} props
 */
export function RulesStep({ onFinish }) {
  const client = useApiClient();
  const { data: rules, mutate, error } = useApi('/rules');
  const [pending, setPending] = useState(null);
  const [failure, setFailure] = useState(null);

  async function toggle(rule, enabled) {
    setPending(rule.id);
    setFailure(null);
    try {
      const updated = await client.patch(`/rules/${rule.id}`, { enabled });
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
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-medium tracking-tight">Choose your rules</h2>
        <p className="mt-1 text-base text-secondary">
          mailmoat sorts incoming mail into Gmail labels using these rules. Rules are matched by
          code from typed fields, never by free text. You can change actions later under Assistant.
        </p>
      </header>
      <table className="w-full">
        <tbody className="divide-y divide-line border-y border-line">
          {rules.map((rule) => {
            const locked = rule.isSecurity;
            const control = (
              <Switch
                aria-label={`${rule.name} enabled`}
                checked={rule.enabled}
                locked={locked}
                disabled={pending === rule.id}
                onCheckedChange={(enabled) => toggle(rule, enabled)}
              />
            );
            return (
              <tr key={rule.id} className="h-12 align-middle">
                <td className="w-16 pr-3">
                  {locked ? <Tooltip label="Security rule, always on">{control}</Tooltip> : control}
                </td>
                <td className="pr-4 font-medium whitespace-nowrap">{rule.name}</td>
                <td className="w-full max-w-0 truncate pr-4 text-secondary">{rule.description}</td>
                <td className="whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    {rule.actions.map((action) => (
                      <ActionChip key={action} action={action} />
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

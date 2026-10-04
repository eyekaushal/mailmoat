import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { INPUT_CLASSES } from '../../components/FormField.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { dateTime } from '../../lib/dates.js';
import { useApi } from '../../lib/useApi.js';
import { ActionChip } from '../../ui/ActionChip.jsx';
import { IconButton } from '../../ui/IconButton.jsx';
import { RiskDot } from '../../ui/RiskDot.jsx';

/**
 * PRD F4.4 on the same table as Rules: when, who, which rule, the actions as chips, the risk as
 * the inbox dot, and "Why?" expanding the stored reasons. No colour carries meaning on its own.
 */
export function HistoryTab() {
  const { data: rules } = useApi('/rules');
  const [ruleId, setRuleId] = useState('');
  const [level, setLevel] = useState('');
  const params = new URLSearchParams({ limit: '100' });
  if (ruleId) params.set('ruleId', ruleId);
  if (level) params.set('level', level);
  const { data: rows, error } = useApi(`/rules/history?${params}`);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <select
          aria-label="Filter by rule"
          value={ruleId}
          onChange={(e) => setRuleId(e.target.value)}
          className={`${INPUT_CLASSES} max-w-48`}
        >
          <option value="">All rules</option>
          {(rules ?? []).map((rule) => (
            <option key={rule.id} value={rule.id}>
              {rule.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by risk"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className={`${INPUT_CLASSES} max-w-40`}
        >
          <option value="">Any risk</option>
          <option value="SAFE">Not flagged</option>
          <option value="SUSPICIOUS">Suspicious</option>
          <option value="DANGEROUS">Dangerous</option>
        </select>
      </div>
      {error && (
        <p role="alert" className="px-5 py-3 text-sm text-danger">
          {error.message}
        </p>
      )}
      {!rows && !error && <LoadingState label="Loading history…" />}
      {rows && rows.length === 0 && (
        <p className="border-t border-line px-5 py-4 text-base text-secondary">
          No rule has run yet.
        </p>
      )}
      {rows && rows.length > 0 && (
        <table className="w-full border-t border-line">
          <thead>
            <tr className="h-9 text-left text-sm text-secondary">
              <th className="pr-4 pl-5 font-normal">When</th>
              <th className="pr-4 font-normal">Sender</th>
              <th className="pr-4 font-normal">Rule</th>
              <th className="w-full pr-4 font-normal">Actions</th>
              <th className="pr-5 font-normal">
                <span className="sr-only">Why</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {rows.map((row) => (
              <HistoryRow
                key={`${row.gmailId}-${row.ruleId}-${row.createdAt}`}
                row={row}
                ruleName={rules?.find((r) => r.id === row.ruleId)?.name ?? row.ruleId}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function HistoryRow({ row, ruleName }) {
  const [open, setOpen] = useState(false);
  const { data: detail } = useApi(open ? `/emails/${row.gmailId}` : null);
  const verdict = row.level ? { level: row.level } : null;
  return (
    <>
      <tr className="h-10">
        <td className="pr-4 pl-5 text-sm whitespace-nowrap text-tertiary tabular-nums">
          {dateTime(row.createdAt)}
        </td>
        <td className="max-w-56 pr-4">
          <span className="flex items-center gap-1.5">
            <RiskDot verdict={verdict} />
            <Link to={`/inbox/${row.gmailId}`} className="truncate hover:underline">
              {row.fromAddr}
            </Link>
          </span>
        </td>
        <td className="pr-4 whitespace-nowrap">{ruleName}</td>
        <td className="pr-4">
          <span className="flex flex-wrap items-center gap-1.5">
            {row.actionsTaken.map((action) => (
              <ActionChip key={action} action={action} />
            ))}
            {row.actionsTaken.length === 0 && <span className="text-tertiary">none</span>}
            {row.status === 'failed' && <span className="text-sm text-secondary">failed</span>}
          </span>
        </td>
        <td className="pr-4 text-right">
          <IconButton
            label={open ? 'Hide why' : 'Why?'}
            icon={open ? CaretDown : CaretRight}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          />
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-surface-2 px-5 py-3 text-base">
            {!detail && <span className="text-secondary">Loading…</span>}
            {detail && (
              <ul className="list-disc space-y-0.5 pl-5">
                {(detail.verdict?.reasons ?? []).map((reason, index) => (
                  <li key={index} className="break-words whitespace-pre-wrap">
                    {reason}
                  </li>
                ))}
                {detail.readerForm && (
                  <li className="text-secondary">
                    Reader: {detail.readerForm.category}, needs reply{' '}
                    {String(detail.readerForm.needs_reply)}
                  </li>
                )}
                {(detail.verdict?.reasons ?? []).length === 0 && !detail.readerForm && (
                  <li className="text-secondary">No stored reasons.</li>
                )}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

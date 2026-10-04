import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { INPUT_CLASSES } from '../../components/FormField.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { RiskBadge } from '../../components/RiskBadge.jsx';
import { useApi } from '../../lib/useApi.js';

/** PRD F4.4: what ran on which email, filterable, with "why?" expanding the verdict's reasons. */
export function HistoryTab() {
  const { data: rules } = useApi('/rules');
  const [ruleId, setRuleId] = useState('');
  const [level, setLevel] = useState('');
  const params = new URLSearchParams({ limit: '100' });
  if (ruleId) params.set('ruleId', ruleId);
  if (level) params.set('level', level);
  const { data: rows, error } = useApi(`/rules/history?${params}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filter by rule"
          value={ruleId}
          onChange={(e) => setRuleId(e.target.value)}
          className={`${INPUT_CLASSES} w-auto`}
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
          className={`${INPUT_CLASSES} w-auto`}
        >
          <option value="">Any risk</option>
          <option value="SAFE">Safe</option>
          <option value="SUSPICIOUS">Suspicious</option>
          <option value="DANGEROUS">Dangerous</option>
        </select>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}
      {!rows && !error && <LoadingState label="Loading history…" />}
      {rows && rows.length === 0 && <p className="text-sm text-muted">No rule has run yet.</p>}
      {rows && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">When</th>
              <th className="py-2 pr-3 font-medium">Sender</th>
              <th className="py-2 pr-3 font-medium">Rule</th>
              <th className="py-2 pr-3 font-medium">Actions</th>
              <th className="py-2 pr-3 font-medium">Risk</th>
              <th className="py-2 font-medium">
                <span className="sr-only">Why</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
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
  const Chevron = open ? CaretDown : CaretRight;
  return (
    <>
      <tr className={row.status === 'failed' ? 'text-muted' : ''}>
        <td className="py-2 pr-3 whitespace-nowrap text-muted">
          {new Date(row.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
        </td>
        <td className="max-w-48 truncate py-2 pr-3">
          <Link to={`/inbox/${row.gmailId}`} className="hover:underline">
            {row.fromAddr}
          </Link>
        </td>
        <td className="py-2 pr-3">{ruleName}</td>
        <td className="py-2 pr-3 text-muted">
          {row.actionsTaken.join(', ') || '—'}
          {row.status === 'failed' && <span className="ml-1 text-danger">(failed)</span>}
        </td>
        <td className="py-2 pr-3">
          <RiskBadge level={row.level} size="sm" />
        </td>
        <td className="py-2 text-right">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg"
          >
            <Chevron aria-hidden="true" className="size-3.5" /> why?
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="bg-surface-2 px-3 py-2 text-sm">
            {!detail && <span className="text-muted">Loading…</span>}
            {detail && (
              <ul className="list-disc space-y-0.5 pl-5">
                {(detail.verdict?.reasons ?? []).map((reason, index) => (
                  <li key={index} className="break-words whitespace-pre-wrap">
                    {reason}
                  </li>
                ))}
                {detail.readerForm && (
                  <li className="text-muted">
                    Reader: {detail.readerForm.category}, needs reply{' '}
                    {String(detail.readerForm.needs_reply)}
                  </li>
                )}
                {(detail.verdict?.reasons ?? []).length === 0 && !detail.readerForm && (
                  <li className="text-muted">No stored reasons.</li>
                )}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

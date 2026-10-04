import { DownloadSimple } from '@phosphor-icons/react';
import { useState } from 'react';
import { INPUT_CLASSES } from '../../components/FormField.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { useApi } from '../../lib/useApi.js';

/** Event names the filter offers; anything else can be typed. */
const EVENTS = [
  'policy_decision',
  'approval_requested',
  'approval_decided',
  'action_performed',
  'plan_created',
  'chat_turn',
  'rule_applied',
  'draft_created',
  'meeting_proposed',
  'google_connected',
  'settings_updated',
];

const DECISION_CLASSES = {
  ALLOW: 'bg-safe-soft text-safe',
  ASK: 'bg-warn-soft text-warn',
  DENY: 'bg-danger-soft text-danger',
};

/** PRD F11.3: every policy decision, approval and error, filterable and exportable as JSON. */
export function AuditLogTable() {
  const [filter, setFilter] = useState('');
  const [subject, setSubject] = useState('');
  const params = new URLSearchParams({ limit: '200' });
  if (filter) params.set('filter', filter);
  if (subject.trim()) params.set('subject', subject.trim());
  const { data: rows, error } = useApi(`/audit?${params}`, { refreshInterval: 30_000 });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          list="audit-events"
          aria-label="Filter by event"
          value={filter}
          onChange={(e) => setFilter(e.target.value.replace(/[^a-z_]/g, ''))}
          placeholder="event, e.g. policy_decision"
          className={`${INPUT_CLASSES} w-56`}
        />
        <datalist id="audit-events">
          {EVENTS.map((event) => (
            <option key={event} value={event} />
          ))}
        </datalist>
        <input
          aria-label="Filter by subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="subject (email or approval id)"
          className={`${INPUT_CLASSES} w-64`}
        />
        <a
          href="/api/audit/export"
          download
          className="ml-auto inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm hover:bg-surface-2"
        >
          <DownloadSimple aria-hidden="true" className="size-4" /> Export JSON
        </a>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}
      {!rows && !error && <LoadingState label="Loading audit log…" />}
      {rows && rows.length === 0 && <p className="text-sm text-muted">No entries match.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 text-left uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium">Decision</th>
                <th className="px-3 py-2 font-medium">Reason / data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line font-mono">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-1.5 whitespace-nowrap text-muted">
                    {row.ts.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="px-3 py-1.5">{row.actor}</td>
                  <td className="px-3 py-1.5 font-medium">{row.event}</td>
                  <td
                    className="max-w-40 truncate px-3 py-1.5 text-muted"
                    title={row.subject ?? ''}
                  >
                    {row.subject ?? ''}
                  </td>
                  <td className="px-3 py-1.5">
                    {row.decision && (
                      <span
                        className={`rounded px-1.5 py-0.5 font-sans font-medium ${DECISION_CLASSES[row.decision] ?? 'bg-surface-2 text-muted'}`}
                      >
                        {row.decision}
                      </span>
                    )}
                  </td>
                  <td className="max-w-md px-3 py-1.5 break-words whitespace-pre-wrap">
                    {row.reason}
                    {row.data && (
                      <span className="text-muted">
                        {row.reason ? ' ' : ''}
                        {JSON.stringify(row.data)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { MailX } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { INPUT_CLASSES } from '../../components/FormField.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { useApi, useApiClient } from '../../lib/useApi.js';
import { METHODS, SenderTable } from './SenderTable.jsx';

const RANGES = [
  { id: 'all', label: 'All time', days: null },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
];

const ENDPOINT = {
  unsubscribe: '/senders/unsubscribe',
  block: '/senders/block',
  keep: '/senders/keep',
  undo: '/senders/undo',
  'archive-all': '/senders/archive-all',
};

function describe(action, sender, result) {
  switch (action) {
    case 'unsubscribe':
      return result.method === 'mailto'
        ? `${sender}: unsubscribe email sent.`
        : `${sender}: unsubscribed with the one-click link.`;
    case 'block':
      return `${sender}: blocked. Future mail is archived under mailmoat/Blocked.${result.warning ? ` ${result.warning}` : ''}`;
    case 'keep':
      return `${sender}: kept.`;
    case 'undo':
      return `${sender}: status reverted.${result.note ? ` ${result.note}` : ' An unsubscribe cannot be undone on the sender’s side.'}`;
    case 'archive-all':
      return `${sender}: ${result.archived} emails archived.`;
    default:
      return `${sender}: done.`;
  }
}

/** PRD F9: senders by volume, one safe method each, bulk actions with a confirmation. */
export function BulkUnsubscribePage() {
  const client = useApiClient();
  const [sort, setSort] = useState('count');
  // `since` is fixed when the range is picked, so the query key does not change on every render.
  const [range, setRange] = useState({ id: 'all', since: null });
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(null);
  const [log, setLog] = useState([]);
  const params = new URLSearchParams({ sort, limit: '200' });
  if (range.since) params.set('since', range.since);
  const { data: senders, error, mutate } = useApi(`/senders?${params}`);

  function report(ok, text) {
    setLog((entries) => [{ ok, text }, ...entries].slice(0, 8));
  }

  async function perform(sender, action) {
    if (action === 'block') {
      const { warning } = await client.get(
        `/senders/block-warning?address=${encodeURIComponent(sender.address)}`,
      );
      const question = warning
        ? `${warning}\n\nBlock ${sender.address} anyway?`
        : `Block ${sender.address}? Future mail from this sender is labelled and archived.`;
      if (!window.confirm(question)) return false;
    }
    const result = await client.post(ENDPOINT[action], { address: sender.address });
    report(true, describe(action, sender.address, result));
    return true;
  }

  async function onAction(sender, action) {
    setBusy(sender.address);
    try {
      await perform(sender, action);
    } catch (caught) {
      report(false, `${sender.address}: ${caught.message}`);
    } finally {
      setBusy(null);
      await mutate();
    }
  }

  async function bulk(action) {
    const chosen = (senders ?? []).filter((s) => selected.has(s.address));
    const targets =
      action === 'unsubscribe'
        ? chosen.filter((s) => METHODS[s.method]?.action === 'unsubscribe' && s.status === 'NONE')
        : action === 'block'
          ? chosen.filter((s) => s.status === 'NONE')
          : chosen;
    const skipped = chosen.length - targets.length;
    if (targets.length === 0) return;
    const verb = {
      unsubscribe: 'Unsubscribe from',
      block: 'Block',
      keep: 'Keep',
      'archive-all': 'Archive all mail from',
    }[action];
    if (
      !window.confirm(
        `${verb} ${targets.length} sender${targets.length === 1 ? '' : 's'}?${skipped ? ` ${skipped} selected sender${skipped === 1 ? ' has' : 's have'} no safe way to do this and will be skipped.` : ''}`,
      )
    )
      return;
    let done = 0;
    for (const sender of targets) {
      setBusy(sender.address);
      try {
        if (action === 'block') {
          await client.post(ENDPOINT.block, { address: sender.address });
          done += 1;
        } else if (await perform(sender, action)) done += 1;
      } catch (caught) {
        report(false, `${sender.address}: ${caught.message}`);
      }
    }
    setBusy(null);
    report(true, `${done} of ${targets.length} done.`);
    setSelected(new Set());
    await mutate();
  }

  function toggle(address) {
    const next = new Set(selected);
    if (next.has(address)) next.delete(address);
    else next.add(address);
    setSelected(next);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Bulk Unsubscribe</h1>
          <p className="mt-1 text-sm text-muted">
            One safe way out per sender. Risky senders are never contacted: blocking keeps their
            mail out of your inbox.
          </p>
        </div>
        <label className="text-sm">
          <span className="sr-only">Time range</span>
          <select
            value={range.id}
            onChange={(e) => {
              const days = RANGES.find((r) => r.id === e.target.value)?.days;
              setRange({
                id: e.target.value,
                since: days ? new Date(Date.now() - days * 86_400_000).toISOString() : null,
              });
            }}
            className={`${INPUT_CLASSES} w-auto`}
            aria-label="Time range"
          >
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className={`${INPUT_CLASSES} w-auto`}
            aria-label="Sort by"
          >
            <option value="count">Most emails</option>
            <option value="read">Least read</option>
          </select>
        </label>
      </header>

      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft/50 px-3 py-2 text-sm"
          role="toolbar"
          aria-label="Bulk actions"
        >
          <span className="font-medium">{selected.size} selected</span>
          <Button
            className="px-2 py-1 text-xs"
            onClick={() => bulk('unsubscribe')}
            disabled={busy !== null}
          >
            Unsubscribe
          </Button>
          <Button
            variant="danger"
            className="px-2 py-1 text-xs"
            onClick={() => bulk('block')}
            disabled={busy !== null}
          >
            Block
          </Button>
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            onClick={() => bulk('keep')}
            disabled={busy !== null}
          >
            Keep
          </Button>
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            onClick={() => bulk('archive-all')}
            disabled={busy !== null}
          >
            Archive all
          </Button>
          <Button
            variant="ghost"
            className="ml-auto px-2 py-1 text-xs"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {log.length > 0 && (
        <ul className="space-y-0.5 text-sm" aria-label="Outcomes">
          {log.map((entry, index) => (
            <li key={index} role="status" className={entry.ok ? 'text-safe' : 'text-danger'}>
              {entry.text}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}
      {!senders && !error && <LoadingState label="Loading senders…" />}
      {senders && senders.length === 0 && (
        <EmptyState
          icon={MailX}
          title="No senders yet"
          description="Senders appear once mail has been synced."
        />
      )}
      {senders && senders.length > 0 && (
        <SenderTable
          senders={senders}
          selected={selected}
          onToggle={toggle}
          onToggleAll={() =>
            setSelected(
              selected.size === senders.length ? new Set() : new Set(senders.map((s) => s.address)),
            )
          }
          onAction={onAction}
          busy={busy}
        />
      )}
    </div>
  );
}

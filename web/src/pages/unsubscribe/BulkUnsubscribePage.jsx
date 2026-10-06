import { Broom, CaretDown, MagnifyingGlass, X } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { useApi, useApiClient } from '../../lib/useApi.js';
import { Dialog } from '../../ui/Dialog.jsx';
import { DropdownMenu, MenuItem } from '../../ui/DropdownMenu.jsx';
import { IconButton } from '../../ui/IconButton.jsx';
import { SearchLine } from '../../ui/SearchLine.jsx';
import { Tabs } from '../../ui/Tabs.jsx';
import { METHODS, SenderTable } from './SenderTable.jsx';

const PAGE = 50;
const MAX = 500;

const RANGES = [
  { id: 'all', label: 'All time', days: null },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
];

const FILTERS = [
  { id: 'unhandled', label: 'Unhandled', keep: (s) => s.status === 'NONE' },
  { id: 'kept', label: 'Kept', keep: (s) => s.status === 'KEPT' },
  { id: 'all', label: 'All', keep: () => true },
];

const ENDPOINT = {
  unsubscribe: '/senders/unsubscribe',
  block: '/senders/block',
  keep: '/senders/keep',
  undo: '/senders/undo',
  'archive-all': '/senders/archive-all',
};

const BULK_VERBS = {
  unsubscribe: 'Unsubscribe from',
  block: 'Block',
  keep: 'Keep',
  'archive-all': 'Archive all mail from',
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

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function matches(sender, query) {
  if (!query) return true;
  const text = `${sender.name ?? ''} ${sender.address}`.toLowerCase();
  return text.includes(query.toLowerCase());
}

/**
 * PRD F9 on the Inbox Zero table (PLAN §13.8): Unhandled / Kept / All, a time range, search,
 * one safe method per sender and bulk actions. Blocking and every bulk action confirm in a
 * dialog first; the Block dialog repeats the Policy Engine's warning.
 */
export function BulkUnsubscribePage() {
  const client = useApiClient();
  const [filter, setFilter] = useState('unhandled');
  const [sort, setSort] = useState('count');
  // `since` is fixed when the range is picked, so the query key does not change on every render.
  const [range, setRange] = useState({ id: 'all', since: null });
  const [limit, setLimit] = useState(PAGE);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(null);
  const [log, setLog] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const params = new URLSearchParams({ sort, limit: String(limit) });
  if (range.since) params.set('since', range.since);
  const { data: senders, error, mutate } = useApi(`/senders?${params}`);

  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const visible = (senders ?? []).filter((s) => active.keep(s) && matches(s, query));
  const tabs = FILTERS.map((f) => ({
    id: f.id,
    label: f.label,
    count: (senders ?? []).filter(f.keep).length,
  }));

  function report(ok, text) {
    setLog((entries) => [{ ok, text }, ...entries].slice(0, 5));
  }

  async function post(sender, action) {
    const result = await client.post(ENDPOINT[action], { address: sender.address });
    report(true, describe(action, sender.address, result));
  }

  async function run(work) {
    try {
      await work();
    } catch (caught) {
      report(false, caught.message);
    } finally {
      setBusy(null);
      await mutate();
    }
  }

  async function onAction(sender, action) {
    setBusy(sender.address);
    if (action !== 'block') return run(() => post(sender, action));
    let warning;
    try {
      ({ warning } = await client.get(
        `/senders/block-warning?address=${encodeURIComponent(sender.address)}`,
      ));
    } catch (caught) {
      setBusy(null);
      report(false, caught.message);
      return;
    }
    setConfirm({
      title: `Block ${sender.address}?`,
      description: warning
        ? `${warning} Future mail from this sender is labelled and archived.`
        : 'Future mail from this sender is labelled and archived.',
      actionLabel: 'Block',
      danger: true,
      onConfirm: () => run(() => post(sender, 'block')),
      onCancel: () => setBusy(null),
    });
  }

  function bulk(action) {
    const chosen = (senders ?? []).filter((s) => selected.has(s.address));
    const targets =
      action === 'unsubscribe'
        ? chosen.filter((s) => METHODS[s.method]?.action === 'unsubscribe' && s.status === 'NONE')
        : action === 'block'
          ? chosen.filter((s) => s.status === 'NONE')
          : chosen;
    const skipped = chosen.length - targets.length;
    if (targets.length === 0) {
      report(
        false,
        action === 'unsubscribe'
          ? `${plural(chosen.length, 'selected sender')} ${chosen.length === 1 ? 'has' : 'have'} no safe unsubscribe link. Use Block instead: future mail is archived and the sender is never contacted.`
          : `${plural(chosen.length, 'selected sender')} ${chosen.length === 1 ? 'is' : 'are'} already decided. Undo from the row menu first.`,
      );
      return;
    }
    setConfirm({
      title: `${BULK_VERBS[action]} ${plural(targets.length, 'sender')}?`,
      description: skipped
        ? `${plural(skipped, 'selected sender')} ${skipped === 1 ? 'has' : 'have'} no safe way to do this and will be skipped.`
        : undefined,
      actionLabel: BULK_VERBS[action].split(' ')[0],
      danger: action === 'block',
      onConfirm: async () => {
        let done = 0;
        for (const sender of targets) {
          setBusy(sender.address);
          try {
            await post(sender, action);
            done += 1;
          } catch (caught) {
            report(false, `${sender.address}: ${caught.message}`);
          }
        }
        setBusy(null);
        report(true, `${done} of ${targets.length} done.`);
        setSelected(new Set());
        await mutate();
      },
    });
  }

  function toggle(address) {
    const next = new Set(selected);
    if (next.has(address)) next.delete(address);
    else next.add(address);
    setSelected(next);
  }

  function toggleAll() {
    const all = visible.every((s) => selected.has(s.address));
    setSelected(all ? new Set() : new Set(visible.map((s) => s.address)));
  }

  function closeConfirm() {
    confirm?.onCancel?.();
    setConfirm(null);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-5">
        {searchOpen ? (
          <SearchLine
            initial={query}
            placeholder="Search senders"
            onSubmit={(text) => {
              setQuery(text);
              setSearchOpen(false);
            }}
            onClose={() => setSearchOpen(false)}
          />
        ) : (
          <>
            <h1 className="min-w-0 truncate text-xl font-medium tracking-tight">
              {query || 'Unsubscribe'}
            </h1>
            {query && <IconButton label="Clear search" icon={X} onClick={() => setQuery('')} />}
            <span className="flex-1" />
            <DropdownMenu
              align="end"
              trigger={
                <Button variant="ghost" aria-label="Time range" className="px-2 font-normal">
                  {RANGES.find((r) => r.id === range.id)?.label}
                  <CaretDown aria-hidden="true" size={12} />
                </Button>
              }
            >
              {RANGES.map((r) => (
                <MenuItem
                  key={r.id}
                  onSelect={() =>
                    setRange({
                      id: r.id,
                      since: r.days
                        ? new Date(Date.now() - r.days * 86_400_000).toISOString()
                        : null,
                    })
                  }
                >
                  {r.label}
                </MenuItem>
              ))}
            </DropdownMenu>
            <IconButton
              label="Search"
              keys={['/']}
              icon={MagnifyingGlass}
              onClick={() => setSearchOpen(true)}
            />
          </>
        )}
      </header>

      {selected.size > 0 ? (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="flex h-9 items-center gap-1 px-3 text-base"
        >
          <span className="px-2 font-medium tabular-nums">{selected.size} selected</span>
          <Button variant="ghost" onClick={() => bulk('unsubscribe')} disabled={busy !== null}>
            Unsubscribe
          </Button>
          <Button variant="ghost" onClick={() => bulk('keep')} disabled={busy !== null}>
            Keep
          </Button>
          <Button variant="ghost" onClick={() => bulk('archive-all')} disabled={busy !== null}>
            Archive all
          </Button>
          <Button variant="danger" onClick={() => bulk('block')} disabled={busy !== null}>
            Block
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : (
        <Tabs value={filter} onChange={setFilter} label="Sender filter" items={tabs} />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        {log.length > 0 && (
          <ul className="space-y-0.5 px-5 py-2 text-sm" aria-label="Outcomes">
            {log.map((entry, index) => (
              <li key={index} role="status" className={entry.ok ? 'text-secondary' : 'text-danger'}>
                {entry.text}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="px-5 py-3 text-sm text-danger">
            {error.message}
          </p>
        )}
        {!senders && !error && <LoadingState label="Loading senders…" />}
        {senders && senders.length === 0 && (
          <EmptyState
            icon={Broom}
            title="No senders yet"
            description="Senders appear once mail has been synced."
          />
        )}
        {senders && senders.length > 0 && visible.length === 0 && (
          <p className="px-5 py-4 text-base text-secondary">
            {query ? 'No sender matches.' : `Nothing ${active.label.toLowerCase()} here.`}
          </p>
        )}
        {visible.length > 0 && (
          <SenderTable
            senders={visible}
            selected={selected}
            onToggle={toggle}
            onToggleAll={toggleAll}
            sort={sort}
            onSort={setSort}
            onAction={onAction}
            busy={busy}
          />
        )}
        {senders && senders.length >= limit && limit < MAX && (
          <div className="flex justify-center border-t border-line py-3">
            <Button variant="ghost" onClick={() => setLimit(Math.min(limit + PAGE, MAX))}>
              Load more
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={confirm !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeConfirm();
        }}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        actions={
          <>
            <Button variant="ghost" onClick={closeConfirm}>
              Cancel
            </Button>
            <Button
              variant={confirm?.danger ? 'danger' : 'primary'}
              onClick={() => {
                const { onConfirm } = confirm;
                setConfirm(null);
                onConfirm();
              }}
            >
              {confirm?.actionLabel ?? 'Confirm'}
            </Button>
          </>
        }
      />
    </div>
  );
}

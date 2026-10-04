import {
  Archive,
  ArrowCounterClockwise,
  CaretDown,
  DotsThree,
  ThumbsUp,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { useApi } from '../../lib/useApi.js';
import { Avatar } from '../../ui/Avatar.jsx';
import { Checkbox } from '../../ui/Checkbox.jsx';
import { DropdownMenu, MenuItem } from '../../ui/DropdownMenu.jsx';
import { IconButton } from '../../ui/IconButton.jsx';
import { Tooltip } from '../../ui/Tooltip.jsx';

/**
 * The one safe method per sender (PRD F9.2): the button says Unsubscribe or Block, the tooltip
 * says why. Risk is never a badge here; a risky sender simply gets Block (PLAN §13.8).
 */
export const METHODS = Object.freeze({
  unsubscribe: {
    label: 'Unsubscribe',
    action: 'unsubscribe',
    hint: 'One-click link over HTTPS, checked before it is followed',
  },
  unsubscribe_mail: {
    label: 'Unsubscribe',
    action: 'unsubscribe',
    hint: 'Sends an unsubscribe email after your approval',
  },
  block: {
    label: 'Block',
    action: 'block',
    hint: 'No safe unsubscribe link; future mail is archived under mailmoat/Blocked',
  },
  report_spam: {
    label: 'Block',
    action: 'block',
    hint: 'Flagged sender: never contacted. Report it as spam in Gmail too',
  },
});

export const STATUS_WORDS = Object.freeze({
  NONE: '',
  KEPT: 'kept',
  UNSUBSCRIBED: 'unsubscribed',
  BLOCKED: 'blocked',
});

export function percent(rate) {
  return `${Math.round((rate ?? 0) * 100)}%`;
}

/** The read bar and its number: how much of this sender's mail was ever opened. */
function ReadBar({ rate }) {
  const value = Math.round((rate ?? 0) * 100);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="progressbar"
        aria-label="Read"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        className="block h-1 w-16 overflow-hidden rounded-full bg-surface-3"
      >
        <span className="block h-full rounded-full bg-accent" style={{ width: `${value}%` }} />
      </span>
      <span className="w-9 text-right text-sm text-secondary tabular-nums">{value}%</span>
    </span>
  );
}

/**
 * The one button a sender gets. Block asks the Policy Engine why (`/senders/block-warning`) the
 * first time the pointer or focus reaches it, so the tooltip can say it; SWR keeps the answer.
 */
function MethodButton({ sender, method, disabled, onClick }) {
  const [wanted, setWanted] = useState(false);
  const isBlock = method.action === 'block';
  const { data } = useApi(
    isBlock && wanted
      ? `/senders/block-warning?address=${encodeURIComponent(sender.address)}`
      : null,
  );
  const why = isBlock && data?.warning ? data.warning : method.hint;
  return (
    <Tooltip label={why}>
      <Button
        variant={isBlock ? 'danger' : 'secondary'}
        className="h-7 px-2.5 text-sm"
        disabled={disabled}
        onPointerEnter={() => setWanted(true)}
        onFocus={() => setWanted(true)}
        onClick={onClick}
      >
        {method.label}
      </Button>
    </Tooltip>
  );
}

function SortHeader({ id, label, sort, onSort, className = '' }) {
  const active = sort === id;
  return (
    <th
      scope="col"
      aria-sort={active ? 'descending' : 'none'}
      className={`font-normal whitespace-nowrap ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(id)}
        className={`inline-flex items-center gap-1 rounded-sm hover:text-ink ${active ? 'text-ink' : ''}`}
      >
        {label}
        {active && <CaretDown aria-hidden="true" size={12} />}
      </button>
    </th>
  );
}

/**
 * The Inbox Zero table (PLAN §13.8): checkbox · avatar · name and address · Emails · read bar
 * and % · thumbs-up = Keep · one button, Unsubscribe or Block · overflow menu with Archive all
 * and Undo. A decided sender shows its status as a quiet word instead of the buttons.
 * @param {{
 *   senders: object[], selected: Set<string>, onToggle: (address: string) => void,
 *   onToggleAll: () => void, sort: 'count' | 'read', onSort: (sort: 'count' | 'read') => void,
 *   onAction: (sender: object, action: 'unsubscribe'|'block'|'keep'|'undo'|'archive-all') => void,
 *   busy: string | null,
 * }} props
 */
export function SenderTable({
  senders,
  selected,
  onToggle,
  onToggleAll,
  sort,
  onSort,
  onAction,
  busy,
}) {
  const chosen = senders.filter((s) => selected.has(s.address)).length;
  const allSelected = senders.length > 0 && chosen === senders.length;
  return (
    <table className="w-full">
      <thead>
        <tr className="h-9 text-left text-sm text-secondary">
          <th scope="col" className="w-10 pr-3 pl-5">
            <Checkbox
              aria-label="Select all"
              checked={allSelected ? true : chosen > 0 ? 'indeterminate' : false}
              onCheckedChange={onToggleAll}
            />
          </th>
          <th scope="col" className="w-full pr-4 font-normal">
            Sender
          </th>
          <SortHeader id="count" label="Emails" sort={sort} onSort={onSort} className="pr-6" />
          <SortHeader id="read" label="Read" sort={sort} onSort={onSort} className="pr-4" />
          <th scope="col" className="pr-5">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line border-t border-line">
        {senders.map((sender) => {
          const method = METHODS[sender.method] ?? METHODS.block;
          const decided = sender.status !== 'NONE';
          const isBusy = busy === sender.address;
          const name = sender.name || sender.address;
          return (
            <tr
              key={sender.address}
              className={`h-12 align-middle ${selected.has(sender.address) ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
            >
              <td className="pr-3 pl-5">
                <Checkbox
                  aria-label={`Select ${sender.address}`}
                  checked={selected.has(sender.address)}
                  onCheckedChange={() => onToggle(sender.address)}
                />
              </td>
              <td className="max-w-0 pr-4">
                <span className="flex items-center gap-3">
                  <Avatar
                    name={name}
                    hueKey={sender.address}
                    initials={sender.avatar?.initials}
                    hue={sender.avatar?.hue}
                  />
                  <span className="min-w-0">
                    <span
                      className={`block truncate ${decided ? 'text-secondary' : 'font-medium'}`}
                    >
                      {name}
                    </span>
                    {sender.name && (
                      <span className="block truncate text-sm text-secondary">
                        {sender.address}
                      </span>
                    )}
                  </span>
                </span>
              </td>
              <td className="pr-6 text-right tabular-nums">{sender.emailCount}</td>
              <td className="pr-4 whitespace-nowrap">
                <ReadBar rate={sender.readRate} />
              </td>
              <td className="pr-3">
                <span className="flex items-center justify-end gap-1">
                  {decided ? (
                    <span className="mr-2 text-sm text-secondary">
                      {STATUS_WORDS[sender.status] ?? sender.status.toLowerCase()}
                    </span>
                  ) : (
                    <>
                      <IconButton
                        label="Keep"
                        icon={ThumbsUp}
                        disabled={isBusy}
                        onClick={() => onAction(sender, 'keep')}
                      />
                      <MethodButton
                        sender={sender}
                        method={method}
                        disabled={isBusy}
                        onClick={() => onAction(sender, method.action)}
                      />
                    </>
                  )}
                  <DropdownMenu
                    align="end"
                    trigger={
                      <IconButton label="More" icon={DotsThree} size={18} disabled={isBusy} />
                    }
                  >
                    <MenuItem icon={Archive} onSelect={() => onAction(sender, 'archive-all')}>
                      Archive all
                    </MenuItem>
                    {decided && (
                      <MenuItem
                        icon={ArrowCounterClockwise}
                        onSelect={() => onAction(sender, 'undo')}
                      >
                        Undo
                      </MenuItem>
                    )}
                  </DropdownMenu>
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

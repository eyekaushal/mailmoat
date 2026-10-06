import {
  Broom,
  CheckCircle,
  GearSix,
  Lightning,
  ShieldCheck,
  Sparkle,
  Tray,
} from '@phosphor-icons/react';
import { NavLink, useMatch } from 'react-router';
import { useApi } from '../lib/useApi.js';
import { Tooltip } from '../ui/Tooltip.jsx';
import { AccountMenu } from './AccountMenu.jsx';
import { useAskAi } from './ask/AskAiProvider.jsx';

/**
 * The seven items of the rail (PRD §8, PLAN §13.3). Six are screens, and the routes in App.jsx
 * are built from them; Ask AI is a side panel, so its item toggles instead of navigating.
 */
export const NAV_ITEMS = Object.freeze([
  { path: '/inbox', label: 'Inbox', Icon: Tray },
  { panel: 'ask', label: 'Ask AI', Icon: Sparkle },
  { path: '/assistant', label: 'Assistant', Icon: Lightning },
  { path: '/approvals', label: 'Approvals', Icon: CheckCircle, badge: 'approvals' },
  { path: '/unsubscribe', label: 'Unsubscribe', Icon: Broom },
  { path: '/security', label: 'Security', Icon: ShieldCheck },
  { path: '/settings', label: 'Settings', Icon: GearSix },
]);

const APPROVALS_REFRESH_MS = 30_000;

const ITEM_CLASSES =
  'relative flex size-9 items-center justify-center rounded-md transition-colors duration-150 ease-out-soft';
const ACTIVE = 'bg-accent-soft text-accent';
const QUIET = 'text-secondary hover:bg-surface-2 hover:text-ink';

/** The Ask AI item: a button that opens or closes the side panel, lit while it is open. */
function PanelItem({ item: { label, Icon } }) {
  const ask = useAskAi();
  return (
    <li>
      <Tooltip label={label} side="right">
        <button
          type="button"
          aria-label={label}
          aria-pressed={ask.isOpen}
          onClick={ask.toggle}
          className={`${ITEM_CLASSES} ${ask.isOpen ? ACTIVE : QUIET}`}
        >
          <Icon size={20} weight={ask.isOpen ? 'fill' : 'regular'} />
        </button>
      </Tooltip>
    </li>
  );
}

/**
 * One rail item. The active state is computed here rather than with NavLink's function props:
 * the tooltip's `asChild` slot merges `className` as a string and would break a function.
 * @param {{ item: (typeof NAV_ITEMS)[number], count: number }} props
 */
function RailItem({ item: { path, label, Icon }, count }) {
  const isActive = Boolean(useMatch(`${path}/*`));
  return (
    <li>
      <Tooltip label={label} side="right">
        <NavLink
          to={path}
          aria-label={label}
          className={`${ITEM_CLASSES} ${isActive ? ACTIVE : QUIET}`}
        >
          <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
          {count > 0 && (
            <span
              aria-label={`${count} pending`}
              className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warn px-1 text-[10px] leading-none font-medium text-accent-fg"
            >
              {count}
            </span>
          )}
        </NavLink>
      </Tooltip>
    </li>
  );
}

/**
 * The icon-only rail on the left: mark, seven items with tooltips, pending-approvals count and
 * the account footer. Labels live in tooltips and `aria-label`s, never beside the icons.
 * @param {{ onShowKeyHints: () => void }} props
 */
export function Rail({ onShowKeyHints }) {
  const { data: approvals } = useApi('/approvals', { refreshInterval: APPROVALS_REFRESH_MS });
  const badges = { approvals: approvals?.length || 0 };

  return (
    <nav
      aria-label="Main"
      className="rail flex h-full w-14 shrink-0 flex-col items-center rounded-lg py-3"
    >
      <img src="/brand/mark.svg" alt="mailmoat" className="mb-3 size-7 rounded-[7px]" />
      <ul className="flex flex-1 flex-col items-center gap-1">
        {NAV_ITEMS.map((item) =>
          item.panel ? (
            <PanelItem key={item.panel} item={item} />
          ) : (
            <RailItem key={item.path} item={item} count={item.badge ? badges[item.badge] : 0} />
          ),
        )}
      </ul>
      <AccountMenu onShowKeyHints={onShowKeyHints} />
    </nav>
  );
}

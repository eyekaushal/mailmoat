import { CaretUpDown, GearSix, Keyboard } from '@phosphor-icons/react';
import { useNavigate } from 'react-router';
import { useApi } from '../lib/useApi.js';
import { Avatar } from '../ui/Avatar.jsx';
import { DropdownMenu, MenuHeader, MenuItem, MenuSeparator } from '../ui/DropdownMenu.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';

const HEALTH_REFRESH_MS = 30_000;

function displayName(settings, email) {
  const name = settings?.userName?.trim();
  if (name) return name;
  return email ? email.split('@')[0] : 'mailmoat';
}

function syncLine(sync) {
  if (!sync?.lastPollAt) return 'First sync pending';
  const time = new Date(sync.lastPollAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Synced ${time} · ${sync.emails} emails`;
}

function StatusLine({ ok, children }) {
  return (
    <p className="flex items-center gap-2 text-sm text-secondary">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${ok ? 'bg-safe' : 'bg-warn'}`} />
      <span className="truncate">{children}</span>
    </p>
  );
}

/**
 * The account footer at the bottom of the rail: the user's avatar opens a menu with avatar ·
 * name · email, the connection status, Settings and the keyboard hints.
 * @param {{ onShowKeyHints: () => void }} props
 */
export function AccountMenu({ onShowKeyHints }) {
  const navigate = useNavigate();
  const { data: health } = useApi('/health', { refreshInterval: HEALTH_REFRESH_MS });
  const { data: view } = useApi('/settings');
  const email = health?.google?.email ?? null;
  const name = displayName(view?.settings, email);
  const google = Boolean(health?.google?.connected);
  const anthropic = Boolean(health?.anthropic?.configured);

  return (
    <DropdownMenu
      side="right"
      align="end"
      trigger={
        <button
          type="button"
          aria-label="Account"
          className="mt-2 rounded-full transition-opacity duration-150 ease-out-soft hover:opacity-85"
        >
          <Tooltip label="Account" side="right">
            <span className="block">
              <Avatar name={name} hueKey={email ?? name} size="sm" className="size-7" />
            </span>
          </Tooltip>
        </button>
      }
    >
      <MenuHeader>
        <div className="flex items-center gap-3">
          <Avatar name={name} hueKey={email ?? name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{name}</p>
            <p className="truncate text-sm text-secondary">{email ?? 'Google not connected'}</p>
          </div>
          <CaretUpDown aria-hidden="true" size={14} className="text-tertiary" />
        </div>
        <div className="mt-3 space-y-1">
          <StatusLine ok={google}>
            {google ? syncLine(health?.sync) : 'Google not connected'}
          </StatusLine>
          <StatusLine ok={anthropic}>
            {anthropic ? 'Anthropic key set' : 'No Anthropic key'}
          </StatusLine>
        </div>
      </MenuHeader>
      <MenuSeparator />
      <MenuItem icon={GearSix} onSelect={() => navigate('/settings')}>
        Settings
      </MenuItem>
      <MenuItem icon={Keyboard} onSelect={onShowKeyHints}>
        Keyboard hints
      </MenuItem>
    </DropdownMenu>
  );
}

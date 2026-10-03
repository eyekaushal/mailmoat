import {
  CheckSquare,
  Inbox,
  MailX,
  MessageSquare,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { NavLink } from 'react-router';
import { useApi } from '../lib/useApi.js';

/** The seven screens of v1 (PRD §8); the routes in App.jsx are built from this list. */
export const NAV_ITEMS = Object.freeze([
  { path: '/inbox', label: 'Inbox', Icon: Inbox },
  { path: '/chat', label: 'Chat', Icon: MessageSquare },
  { path: '/assistant', label: 'Assistant', Icon: Sparkles },
  { path: '/approvals', label: 'Approvals', Icon: CheckSquare, badge: 'approvals' },
  { path: '/unsubscribe', label: 'Bulk Unsubscribe', Icon: MailX },
  { path: '/security', label: 'Security Center', Icon: ShieldCheck },
  { path: '/settings', label: 'Settings', Icon: Settings },
]);

const HEALTH_REFRESH_MS = 30_000;

function Status({ health }) {
  if (!health) return <span className="text-muted">Connecting…</span>;
  const google = health.google?.connected;
  const anthropic = health.anthropic?.configured;
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${google ? 'bg-safe' : 'bg-warn'}`}
        />
        <span className="truncate">
          {google ? (health.google.email ?? 'Google connected') : 'Google not connected'}
        </span>
      </p>
      <p className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${anthropic ? 'bg-safe' : 'bg-warn'}`}
        />
        <span>{anthropic ? 'Anthropic key set' : 'No Anthropic key'}</span>
      </p>
      {google && (
        <p className="text-muted">
          {health.sync?.lastPollAt
            ? `Synced ${new Date(health.sync.lastPollAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${health.sync.emails} emails`
            : 'First sync pending'}
        </p>
      )}
    </div>
  );
}

/** Left navigation: logo, the seven screens, pending-approval count and connection status. */
export function Sidebar() {
  const { data: health } = useApi('/health', { refreshInterval: HEALTH_REFRESH_MS });
  const { data: approvals } = useApi('/approvals', { refreshInterval: HEALTH_REFRESH_MS });
  const badges = { approvals: approvals?.length || 0 };

  return (
    <nav
      aria-label="Main"
      className="flex h-full w-14 flex-col border-r border-line bg-surface md:w-60"
    >
      <div className="flex h-14 items-center gap-2 px-3 md:px-4">
        <img src="/favicon.svg" alt="" className="size-7" />
        <span className="hidden text-base font-semibold tracking-tight md:inline">mailmoat</span>
      </div>
      <ul className="flex-1 space-y-0.5 px-2 py-2">
        {NAV_ITEMS.map(({ path, label, Icon, badge }) => (
          <li key={path}>
            <NavLink
              to={path}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-2 py-2 text-sm md:px-3 ${
                  isActive ? 'bg-accent-soft font-medium text-accent' : 'text-fg hover:bg-surface-2'
                }`
              }
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              <span className="hidden flex-1 md:inline">{label}</span>
              {badge && badges[badge] > 0 && (
                <span
                  aria-label={`${badges[badge]} pending`}
                  className="hidden min-w-5 rounded-full bg-accent px-1.5 text-center text-xs font-semibold text-accent-fg md:inline"
                >
                  {badges[badge]}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="hidden border-t border-line px-4 py-3 text-xs md:block">
        <Status health={health} />
      </div>
    </nav>
  );
}

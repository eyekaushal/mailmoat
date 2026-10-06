import { Tray } from '@phosphor-icons/react';
import { useApi } from '../../lib/useApi.js';
import { LABELS } from '../../ui/Tag.jsx';
import { Tabs } from '../../ui/Tabs.jsx';

const PAGE_SIZE = 50;

/** All plus one tab per label (PLAN §13.5). Suspicious and Dangerous live in Security Center. */
export const TABS = Object.freeze([
  { id: 'all', label: 'All', Icon: Tray },
  ...LABELS.map(({ id, label, Icon }) => ({ id, label, Icon, rule: id })),
]);

/** @param {string} tabId @returns {string} the `GET /emails` path for that tab's first page */
export function queryForTab(tabId) {
  const tab = TABS.find((item) => item.id === tabId) ?? TABS[0];
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (tab.rule) params.set('label', tab.rule);
  return `/emails?${params}`;
}

/**
 * @param {{ active: string, onChange: (tabId: string) => void }} props
 */
export function InboxTabs({ active, onChange }) {
  const { data: counts } = useApi('/emails/counts', { refreshInterval: 30_000 });
  const { data: rules } = useApi('/rules');
  // A rule the user switched off no longer labels mail, so its tab goes too; until the rules
  // are known every tab shows.
  const disabled = new Set((rules ?? []).filter((r) => r.enabled === false).map((r) => r.id));
  const shown = TABS.filter((tab) => !tab.rule || !disabled.has(tab.rule));
  const items = shown.map((tab) => ({
    ...tab,
    count: !counts ? 0 : tab.rule ? (counts.byRule?.[tab.rule] ?? 0) : (counts.all ?? 0),
  }));
  const value = shown.some((tab) => tab.id === active) ? active : 'all';
  return <Tabs label="Inbox tabs" value={value} items={items} onChange={onChange} />;
}

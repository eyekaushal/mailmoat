import { OctagonAlert, TriangleAlert } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';

const PAGE_SIZE = 50;

/** The tab bar of PRD F5.1: every assistant rule plus the two risk levels. */
export const TABS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'to_reply', label: 'To Reply', rule: 'to_reply' },
  { id: 'awaiting_reply', label: 'Awaiting', rule: 'awaiting_reply' },
  { id: 'fyi', label: 'FYI', rule: 'fyi' },
  { id: 'newsletter', label: 'Newsletter', rule: 'newsletter' },
  { id: 'marketing', label: 'Marketing', rule: 'marketing' },
  { id: 'calendar', label: 'Calendar', rule: 'calendar' },
  { id: 'receipt', label: 'Receipt', rule: 'receipt' },
  { id: 'notification', label: 'Notification', rule: 'notification' },
  { id: 'cold_email', label: 'Cold', rule: 'cold_email' },
  {
    id: 'suspicious',
    label: 'Suspicious',
    risk: 'SUSPICIOUS',
    Icon: TriangleAlert,
    tone: 'text-warn',
  },
  {
    id: 'dangerous',
    label: 'Dangerous',
    risk: 'DANGEROUS',
    Icon: OctagonAlert,
    tone: 'text-danger',
  },
]);

/** @param {string} tabId @returns {string} the `GET /emails` path for that tab's first page */
export function queryForTab(tabId) {
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (tab.rule) params.set('label', tab.rule);
  if (tab.risk) params.set('risk', tab.risk);
  return `/emails?${params}`;
}

function countFor(tab, counts) {
  if (!counts) return null;
  if (tab.rule) return counts.byRule?.[tab.rule] ?? 0;
  if (tab.risk) return counts.byLevel?.[tab.risk] ?? 0;
  return counts.all ?? 0;
}

/**
 * @param {{ active: string, onChange: (tabId: string) => void }} props
 */
export function LabelTabs({ active, onChange }) {
  const { data: counts } = useApi('/emails/counts', { refreshInterval: 30_000 });
  return (
    <div
      role="tablist"
      aria-label="Inbox tabs"
      className="flex gap-1 overflow-x-auto border-b border-line px-2"
    >
      {TABS.map((tab) => {
        const selected = tab.id === active;
        const count = countFor(tab, counts);
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${
              selected
                ? 'border-accent font-medium text-fg'
                : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {tab.Icon && <tab.Icon aria-hidden="true" className={`size-3.5 ${tab.tone}`} />}
            {tab.label}
            {count !== null && count > 0 && (
              <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-medium text-muted">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

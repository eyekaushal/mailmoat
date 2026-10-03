import {
  OctagonAlert,
  ScanSearch,
  ShieldBan,
  ShieldOff,
  TriangleAlert,
  Hourglass,
} from 'lucide-react';
import { useState } from 'react';
import { useApi } from '../../lib/useApi.js';
import { AuditLogTable } from './AuditLogTable.jsx';
import { ThreatFeed } from './ThreatFeed.jsx';

const CARDS = [
  { key: 'scanned', label: 'Emails scanned', Icon: ScanSearch, tone: 'text-fg' },
  { key: 'suspicious', label: 'Suspicious', Icon: TriangleAlert, tone: 'text-warn' },
  { key: 'dangerous', label: 'Dangerous', Icon: OctagonAlert, tone: 'text-danger' },
  {
    key: 'injectionAttempts',
    label: 'Injection attempts blocked',
    Icon: ShieldBan,
    tone: 'text-danger',
  },
  { key: 'denied', label: 'Actions denied by policy', Icon: ShieldOff, tone: 'text-fg' },
  {
    key: 'pendingApprovals',
    label: 'Waiting for your approval',
    Icon: Hourglass,
    tone: 'text-accent',
  },
];

/** PRD F11: overview numbers for 7 or 30 days, the threat feed and the audit log. */
export function SecurityCenterPage() {
  const [days, setDays] = useState(7);
  const { data: overview } = useApi(`/security/overview?days=${days}`, { refreshInterval: 30_000 });
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-xl font-semibold tracking-tight">Security Center</h1>
        <div
          role="radiogroup"
          aria-label="Period"
          className="flex rounded-md border border-line text-sm"
        >
          {[7, 30].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={days === n}
              onClick={() => setDays(n)}
              className={`px-3 py-1.5 ${days === n ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:text-fg'}`}
            >
              {n} days
            </button>
          ))}
        </div>
      </header>

      <section
        aria-label="Overview"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
      >
        {CARDS.map(({ key, label, Icon, tone }) => (
          <div key={key} className="rounded-lg border border-line bg-surface p-4">
            <Icon aria-hidden="true" className={`size-5 ${tone}`} />
            <p
              className="mt-2 text-2xl font-semibold tabular-nums"
              aria-label={`${label}: ${overview?.[key] ?? 0}`}
            >
              {overview ? (overview[key] ?? 0) : '…'}
            </p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Threat feed</h2>
        <ThreatFeed />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Audit log</h2>
        <p className="text-sm text-muted">
          Every plan, policy decision, approval and action, in order. The dashboard’s record of what
          mailmoat did and refused to do.
        </p>
        <AuditLogTable />
      </section>
    </div>
  );
}

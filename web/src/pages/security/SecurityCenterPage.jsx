import { useState } from 'react';
import { useApi } from '../../lib/useApi.js';
import { ThreatFeed } from './ThreatFeed.jsx';

const FIGURES = [
  { key: 'scanned', label: 'Emails scanned' },
  { key: 'suspicious', label: 'Suspicious' },
  { key: 'dangerous', label: 'Dangerous' },
  { key: 'injectionAttempts', label: 'Injection attempts blocked' },
  { key: 'denied', label: 'Actions denied by policy' },
  { key: 'pendingApprovals', label: 'Waiting for your approval' },
];

const PERIODS = [7, 30];

/**
 * PRD F11 on one calm layout (PLAN §13.8): the overview numbers for 7 or 30 days, then the
 * threat feed. The audit log left the UI (decision 5); its export lives under Settings → Advanced.
 */
export function SecurityCenterPage() {
  const [days, setDays] = useState(7);
  const { data: overview } = useApi(`/security/overview?days=${days}`, { refreshInterval: 30_000 });
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-5">
        <h1 className="flex-1 text-xl font-medium tracking-tight">Security Center</h1>
        <div role="radiogroup" aria-label="Period" className="flex items-center gap-0.5 text-base">
          {PERIODS.map((n) => {
            const on = days === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setDays(n)}
                className={`h-7 rounded-md px-2 transition-colors duration-150 ease-out-soft ${
                  on ? 'bg-surface-3 font-medium text-ink' : 'text-secondary hover:text-ink'
                }`}
              >
                {n} days
              </button>
            );
          })}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        <dl
          aria-label="Overview"
          className="grid grid-cols-3 gap-x-6 gap-y-4 px-5 py-5 lg:grid-cols-6"
        >
          {FIGURES.map(({ key, label }) => (
            <div key={key} className="min-w-0">
              <dd
                className="text-2xl font-medium tabular-nums"
                aria-label={`${label}: ${overview?.[key] ?? 0}`}
              >
                {overview ? (overview[key] ?? 0) : '…'}
              </dd>
              <dt className="mt-0.5 truncate text-sm text-secondary">{label}</dt>
            </div>
          ))}
        </dl>

        <section aria-label="Threat feed" className="border-t border-line">
          <h2 className="flex h-9 items-center px-5 text-sm text-secondary">
            Flagged mail, newest first
          </h2>
          <ThreatFeed />
        </section>
      </div>
    </div>
  );
}

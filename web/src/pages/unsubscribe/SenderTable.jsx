import { RiskBadge } from '../../components/RiskBadge.jsx';
import { Button } from '../../components/Button.jsx';

/** The one safe method per sender (PRD F9.2), as a button label and its action. */
export const METHODS = Object.freeze({
  unsubscribe: {
    label: 'Unsubscribe',
    action: 'unsubscribe',
    hint: 'One-click, HTTPS, SSRF-checked',
  },
  unsubscribe_mail: {
    label: 'Unsubscribe by email',
    action: 'unsubscribe',
    hint: 'Sends an email after your approval',
  },
  block: {
    label: 'Block',
    action: 'block',
    hint: 'No safe unsubscribe link; future mail is archived',
  },
  report_spam: {
    label: 'Block (report in Gmail)',
    action: 'block',
    hint: 'Risky sender: never contacted; report as spam in Gmail too',
  },
});

const STATUS_LABELS = { NONE: '', KEPT: 'kept', UNSUBSCRIBED: 'unsubscribed', BLOCKED: 'blocked' };

export function percent(rate) {
  return `${Math.round((rate ?? 0) * 100)}%`;
}

/**
 * @param {{
 *   senders: object[], selected: Set<string>, onToggle: (address: string) => void, onToggleAll: () => void,
 *   onAction: (sender: object, action: 'unsubscribe'|'block'|'keep'|'undo'|'archive-all') => void, busy: string | null,
 * }} props
 */
export function SenderTable({ senders, selected, onToggle, onToggleAll, onAction, busy }) {
  const allSelected = senders.length > 0 && senders.every((s) => selected.has(s.address));
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="py-2 pr-2">
            <input
              type="checkbox"
              aria-label="Select all"
              checked={allSelected}
              onChange={onToggleAll}
              className="size-4 accent-accent"
            />
          </th>
          <th className="py-2 pr-3 font-medium">Sender</th>
          <th className="py-2 pr-3 font-medium text-right">Emails</th>
          <th className="py-2 pr-3 font-medium text-right">Read</th>
          <th className="py-2 pr-3 font-medium">Last</th>
          <th className="py-2 pr-3 font-medium">Risk</th>
          <th className="py-2 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {senders.map((sender) => {
          const method = METHODS[sender.method] ?? METHODS.block;
          const decided = sender.status !== 'NONE';
          const isBusy = busy === sender.address;
          return (
            <tr key={sender.address} className={decided ? 'text-muted' : ''}>
              <td className="py-2 pr-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${sender.address}`}
                  checked={selected.has(sender.address)}
                  onChange={() => onToggle(sender.address)}
                  className="size-4 accent-accent"
                />
              </td>
              <td className="max-w-64 py-2 pr-3">
                <span className="block truncate font-mono text-xs">{sender.address}</span>
                {decided && (
                  <span className="text-xs uppercase">{STATUS_LABELS[sender.status]}</span>
                )}
              </td>
              <td className="py-2 pr-3 text-right">{sender.emailCount}</td>
              <td className="py-2 pr-3 text-right">{percent(sender.readRate)}</td>
              <td className="py-2 pr-3 whitespace-nowrap text-muted">
                {sender.lastReceived ? new Date(sender.lastReceived).toLocaleDateString() : '—'}
              </td>
              <td className="py-2 pr-3">
                <RiskBadge level={sender.level} size="sm" />
              </td>
              <td className="py-2">
                <div className="flex flex-wrap gap-1">
                  {!decided && (
                    <>
                      <Button
                        variant={method.action === 'block' ? 'danger' : 'primary'}
                        className="px-2 py-1 text-xs"
                        title={method.hint}
                        disabled={isBusy}
                        onClick={() => onAction(sender, method.action)}
                      >
                        {method.label}
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-2 py-1 text-xs"
                        disabled={isBusy}
                        onClick={() => onAction(sender, 'keep')}
                      >
                        Keep
                      </Button>
                    </>
                  )}
                  <Button
                    variant="secondary"
                    className="px-2 py-1 text-xs"
                    disabled={isBusy}
                    onClick={() => onAction(sender, 'archive-all')}
                  >
                    Archive all
                  </Button>
                  {decided && (
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      disabled={isBusy}
                      onClick={() => onAction(sender, 'undo')}
                    >
                      Undo
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

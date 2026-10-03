const CATEGORY_LABELS = {
  personal: 'Personal',
  work: 'Work',
  newsletter: 'Newsletter',
  marketing: 'Marketing',
  receipt: 'Receipt',
  notification: 'Notification',
  calendar: 'Calendar',
  security_alert: 'Security alert',
  cold_outreach: 'Cold outreach',
  other: 'Other',
};

/**
 * The Reader's category for an email: an enum, so it is safe to show as-is (unknown → "Other").
 * @param {{ category: string | null | undefined, className?: string }} props
 */
export function CategoryBadge({ category, className = '' }) {
  const label = CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other;
  return (
    <span
      className={`inline-flex items-center rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-muted ${className}`}
    >
      {label}
    </span>
  );
}

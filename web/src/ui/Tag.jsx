import {
  ArrowBendUpLeft,
  Bell,
  CalendarBlank,
  HourglassMedium,
  Info,
  Megaphone,
  Newspaper,
  Receipt,
  Snowflake,
} from '@phosphor-icons/react';

/**
 * The label palette (DESIGN.md §2), one entry per assistant rule, in priority order: a row that
 * matched several rules wears the first one found here. Suspicious and Dangerous are not labels
 * in the list; they appear on the opened email only (R04).
 */
export const LABELS = Object.freeze([
  {
    id: 'to_reply',
    label: 'To reply',
    Icon: ArrowBendUpLeft,
    tone: 'bg-tag-reply text-tag-reply-ink',
  },
  {
    id: 'awaiting_reply',
    label: 'Awaiting',
    Icon: HourglassMedium,
    tone: 'bg-tag-awaiting text-tag-awaiting-ink',
  },
  { id: 'fyi', label: 'FYI', Icon: Info, tone: 'bg-tag-fyi text-tag-fyi-ink' },
  {
    id: 'newsletter',
    label: 'Newsletter',
    Icon: Newspaper,
    tone: 'bg-tag-newsletter text-tag-newsletter-ink',
  },
  {
    id: 'marketing',
    label: 'Marketing',
    Icon: Megaphone,
    tone: 'bg-tag-marketing text-tag-marketing-ink',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    Icon: CalendarBlank,
    tone: 'bg-tag-calendar text-tag-calendar-ink',
  },
  { id: 'receipt', label: 'Receipt', Icon: Receipt, tone: 'bg-tag-receipt text-tag-receipt-ink' },
  {
    id: 'notification',
    label: 'Notification',
    Icon: Bell,
    tone: 'bg-tag-notification text-tag-notification-ink',
  },
  { id: 'cold_email', label: 'Cold', Icon: Snowflake, tone: 'bg-tag-cold text-tag-cold-ink' },
]);

/**
 * @param {string[] | null | undefined} ruleIds the rules an email matched
 * @returns {(typeof LABELS)[number] | null} the one label the row shows
 */
export function labelFor(ruleIds) {
  return LABELS.find((entry) => ruleIds?.includes(entry.id)) ?? null;
}

/**
 * A tinted label: 11 px, lowercase, no icon (the icon belongs to the tab).
 * @param {{ label: string | (typeof LABELS)[number], className?: string }} props
 */
export function Tag({ label, className = '' }) {
  const entry = typeof label === 'string' ? LABELS.find((item) => item.id === label) : label;
  if (!entry) return null;
  return (
    <span
      className={`inline-flex h-[18px] shrink-0 items-center rounded-[4px] px-1.5 text-xs font-medium lowercase ${entry.tone} ${className}`}
    >
      {entry.label}
    </span>
  );
}

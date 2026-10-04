import { Shield, ShieldCheck, Warning, WarningOctagon } from '@phosphor-icons/react';

/** Every risk level is an icon plus a word, never a colour alone (PRD §9). */
const RISK_META = {
  SAFE: { label: 'Safe', Icon: ShieldCheck, tone: 'safe' },
  SUSPICIOUS: { label: 'Suspicious', Icon: Warning, tone: 'warn' },
  DANGEROUS: { label: 'Dangerous', Icon: WarningOctagon, tone: 'danger' },
};

const UNKNOWN = { label: 'Not analysed', Icon: Shield, tone: 'neutral' };

const TONE_CLASSES = {
  safe: 'bg-safe-soft text-safe',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-neutral-soft text-neutral',
};

/**
 * @param {string | null | undefined} level
 * @returns {{ label: string, Icon: import('react').ComponentType, tone: 'safe'|'warn'|'danger'|'neutral' }}
 */
export function riskMeta(level) {
  return RISK_META[level] ?? UNKNOWN;
}

/** @param {'safe'|'warn'|'danger'|'neutral'} tone */
export function toneClasses(tone) {
  return TONE_CLASSES[tone] ?? TONE_CLASSES.neutral;
}

/**
 * @param {{ level: string | null | undefined, size?: 'sm' | 'md', className?: string }} props
 */
export function RiskBadge({ level, size = 'md', className = '' }) {
  const { label, Icon, tone } = riskMeta(level);
  const sizing = size === 'sm' ? 'text-xs px-1.5 py-0.5 gap-1' : 'text-sm px-2 py-1 gap-1.5';
  return (
    <span
      className={`inline-flex items-center rounded-md font-medium ${sizing} ${toneClasses(tone)} ${className}`}
      data-level={level ?? 'UNKNOWN'}
    >
      <Icon aria-hidden="true" className={size === 'sm' ? 'size-3.5' : 'size-4'} />
      {label}
    </span>
  );
}

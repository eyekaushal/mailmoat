/** The rule actions on the chip palette (DESIGN.md §2 Action chips). */
export const ACTION_CHIPS = Object.freeze({
  label: { label: 'Label', tone: 'bg-chip-label text-chip-label-ink' },
  archive: { label: 'Archive', tone: 'bg-chip-archive text-chip-archive-ink' },
  draft_reply: { label: 'Draft', tone: 'bg-chip-draft text-chip-draft-ink' },
  alert: { label: 'Alert', tone: 'bg-chip-block text-chip-block-ink' },
  log: { label: 'Log', tone: 'bg-surface-3 text-secondary' },
});

/** @param {string} action */
export function chipFor(action) {
  return (
    ACTION_CHIPS[action] ?? {
      label: action.replaceAll('_', ' '),
      tone: 'bg-surface-3 text-secondary',
    }
  );
}

const BASE =
  'inline-flex h-[18px] shrink-0 items-center rounded-[4px] px-1.5 text-xs font-medium lowercase transition-colors duration-150 ease-out-soft';

/**
 * A rule action as a tinted chip. With `onToggle` it is a pressable toggle: selected chips wear
 * their tint, unselected ones are quiet; a disabled one keeps its look and explains nothing here
 * (the row's lock does).
 * @param {{ action: string, selected?: boolean, onToggle?: () => void, disabled?: boolean,
 *   title?: string }} props
 */
export function ActionChip({ action, selected = true, onToggle, disabled = false, title }) {
  const { label, tone } = chipFor(action);
  const look = selected ? tone : 'bg-surface-2 text-secondary line-through decoration-tertiary';
  if (!onToggle) return <span className={`${BASE} ${tone}`}>{label}</span>;
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${label} action`}
      title={title}
      disabled={disabled}
      onClick={onToggle}
      className={`${BASE} ${look} disabled:cursor-not-allowed disabled:opacity-60 ${
        disabled ? '' : 'hover:brightness-95'
      }`}
    >
      {label}
    </button>
  );
}

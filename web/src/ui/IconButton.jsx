import { Tooltip } from './Tooltip.jsx';

/**
 * A quiet icon-only button. The label is both the accessible name and the tooltip, with the
 * keyboard hint when one exists (DESIGN.md §8).
 * @param {{ label: string, icon: import('react').ComponentType<{ size?: number }>, keys?: string[],
 *   side?: 'top' | 'right' | 'bottom' | 'left', size?: number, className?: string } &
 *   import('react').ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function IconButton({
  label,
  icon: Icon,
  keys,
  side = 'bottom',
  size = 16,
  className = '',
  ...rest
}) {
  return (
    <Tooltip label={label} keys={keys} side={side}>
      <button
        type="button"
        aria-label={label}
        className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md text-secondary transition-colors duration-150 ease-out-soft hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
        {...rest}
      >
        <Icon size={size} />
      </button>
    </Tooltip>
  );
}

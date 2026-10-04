/**
 * A 40 px list row (DESIGN.md §8). The whole row is one button that opens the item; `trailing`
 * (usually the time) sits at the right edge and gives way to `actions` on hover or keyboard focus.
 * The actions are siblings of the row button, never nested inside it.
 * @param {{ selected?: boolean, onOpen?: () => void, trailing?: import('react').ReactNode,
 *   actions?: import('react').ReactNode, children: import('react').ReactNode, className?: string }} props
 */
export function Row({ selected = false, onOpen, trailing, actions, children, className = '' }) {
  return (
    <li className={`group relative ${className}`}>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? 'true' : undefined}
        className={`flex h-10 w-full items-center gap-3 px-4 text-left transition-colors duration-150 ease-out-soft hover:bg-surface-2 ${
          selected ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--accent)]' : ''
        }`}
      >
        {children}
        {trailing && (
          <span
            className={`ml-auto flex w-[88px] shrink-0 justify-end ${
              actions ? 'group-focus-within:invisible group-hover:invisible' : ''
            }`}
          >
            {trailing}
          </span>
        )}
      </button>
      {actions && (
        <div className="invisible absolute inset-y-0 right-3 flex items-center gap-0.5 group-focus-within:visible group-hover:visible">
          {actions}
        </div>
      )}
    </li>
  );
}

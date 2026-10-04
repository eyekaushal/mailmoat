import { Tabs as Radix } from 'radix-ui';

/**
 * Quiet text tabs with an icon and a count (DESIGN.md §8): the selected one is ink at 500
 * weight, the others secondary. The panels live outside; this is only the strip.
 * @param {{ value: string, onChange: (id: string) => void, label: string,
 *   items: { id: string, label: string, Icon?: import('react').ComponentType<{ size?: number }>,
 *     count?: number }[] }} props
 */
export function Tabs({ value, onChange, label, items }) {
  return (
    <Radix.Root value={value} onValueChange={onChange}>
      <Radix.List aria-label={label} className="flex items-center gap-0.5 overflow-x-auto px-3">
        {items.map(({ id, label: text, Icon, count = 0 }) => (
          <Radix.Trigger
            key={id}
            value={id}
            className="group flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-base text-secondary transition-colors duration-150 ease-out-soft hover:text-ink data-[state=active]:font-medium data-[state=active]:text-ink"
          >
            {Icon && <Icon aria-hidden="true" size={16} />}
            {text}
            {count > 0 && (
              <span className="text-xs text-tertiary tabular-nums group-data-[state=active]:text-secondary">
                {count}
              </span>
            )}
          </Radix.Trigger>
        ))}
      </Radix.List>
    </Radix.Root>
  );
}

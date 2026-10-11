import { Popover as Radix } from 'radix-ui';

/**
 * A small panel anchored to a control (DESIGN.md §8), for a sentence the user must read where
 * they clicked: never at the top of a screen. Closes on Esc, outside click or `open` false.
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void, label: string,
 *   side?: 'top' | 'right' | 'bottom' | 'left', align?: 'start' | 'center' | 'end',
 *   anchor: import('react').ReactElement, children: import('react').ReactNode }} props
 */
export function Popover({
  open,
  onOpenChange,
  label,
  side = 'top',
  align = 'end',
  anchor,
  children,
}) {
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <Radix.Anchor asChild>{anchor}</Radix.Anchor>
      <Radix.Portal>
        <Radix.Content
          aria-label={label}
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="pop z-40 w-72 p-3 text-sm text-ink outline-none"
        >
          {children}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}

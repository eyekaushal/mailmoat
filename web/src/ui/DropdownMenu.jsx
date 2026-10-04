import { DropdownMenu as Radix } from 'radix-ui';

/**
 * A menu opened from `trigger`. Items are `MenuItem`s; `MenuSeparator` and `MenuHeader` group them.
 * @param {{ trigger: import('react').ReactElement, side?: 'top' | 'right' | 'bottom' | 'left',
 *   align?: 'start' | 'center' | 'end', children: import('react').ReactNode }} props
 */
export function DropdownMenu({ trigger, side = 'bottom', align = 'start', children }) {
  return (
    <Radix.Root modal={false}>
      <Radix.Trigger asChild>{trigger}</Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="pop z-40 min-w-48 p-1.5 text-base text-ink"
        >
          {children}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}

/**
 * @param {{ icon?: import('react').ComponentType<{ size?: number, className?: string }>,
 *   onSelect?: () => void, danger?: boolean, disabled?: boolean,
 *   children: import('react').ReactNode }} props
 */
export function MenuItem({ icon: Icon, onSelect, danger = false, disabled = false, children }) {
  return (
    <Radix.Item
      onSelect={onSelect}
      disabled={disabled}
      className={`flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-1.5 outline-none select-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-45 ${danger ? 'text-danger' : ''}`}
    >
      {Icon && <Icon size={16} className={danger ? '' : 'text-secondary'} />}
      {children}
    </Radix.Item>
  );
}

export function MenuSeparator() {
  return <Radix.Separator className="my-1.5 h-px bg-line" />;
}

/** Non-interactive content at the top of a menu (the account header). */
export function MenuHeader({ children }) {
  return <div className="px-2.5 py-2">{children}</div>;
}

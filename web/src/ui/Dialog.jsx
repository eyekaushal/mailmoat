import { X } from '@phosphor-icons/react';
import { Dialog as Radix } from 'radix-ui';

/**
 * A centred dialog (DESIGN.md §8). `actions` sit right-aligned under the body; put the primary
 * button last and Cancel as a text button.
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void, title: string,
 *   description?: string, actions?: import('react').ReactNode,
 *   children?: import('react').ReactNode }} props
 */
export function Dialog({ open, onOpenChange, title, description, actions, children }) {
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <Radix.Portal>
        <Radix.Overlay className="fixed inset-0 z-50 bg-ink/25 animate-[pop-in_160ms_var(--ease)]" />
        <Radix.Content className="pop fixed top-1/2 left-1/2 z-50 w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-lg p-5 text-base text-ink outline-none">
          <div className="flex items-start justify-between gap-4">
            <Radix.Title className="text-lg font-medium tracking-tight">{title}</Radix.Title>
            <Radix.Close
              aria-label="Close"
              className="-mt-1 -mr-1 rounded-md p-1 text-secondary hover:bg-surface-2 hover:text-ink"
            >
              <X size={16} />
            </Radix.Close>
          </div>
          {description && (
            <Radix.Description className="mt-1 text-secondary">{description}</Radix.Description>
          )}
          {children && <div className="mt-4">{children}</div>}
          {actions && <div className="mt-5 flex justify-end gap-2">{actions}</div>}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}

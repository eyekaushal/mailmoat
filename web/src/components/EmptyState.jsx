import { Tray } from '@phosphor-icons/react';

/**
 * A quiet placeholder for lists and pages with nothing to show yet (DESIGN.md §6).
 * @param {{ icon?: import('react').ComponentType<{ size?: number, className?: string }>, title: string,
 *   description?: string, action?: import('react').ReactNode }} props
 */
export function EmptyState({ icon: Icon = Tray, title, description, action }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="rounded-full bg-surface-2 p-3 text-secondary">
        <Icon aria-hidden="true" size={20} />
      </div>
      <h2 className="text-md font-medium">{title}</h2>
      {description && <p className="max-w-sm text-base text-secondary">{description}</p>}
      {action}
    </div>
  );
}

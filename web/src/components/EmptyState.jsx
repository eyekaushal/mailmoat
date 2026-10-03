import { Inbox } from 'lucide-react';

/**
 * A quiet placeholder for lists and pages with nothing to show yet.
 * @param {{ icon?: import('react').ComponentType<{ className?: string }>, title: string,
 *   description?: string, action?: import('react').ReactNode }} props
 */
export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="rounded-full bg-surface-2 p-3 text-muted">
        <Icon aria-hidden="true" className="size-6" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

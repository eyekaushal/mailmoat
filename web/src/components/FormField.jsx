import { useId } from 'react';

export const INPUT_CLASSES =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none';

/**
 * Label + control + optional hint, wired together for screen readers.
 * @param {{ label: string, hint?: string, error?: string | null,
 *   children: (id: string) => import('react').ReactNode }} props
 */
export function FormField({ label, hint, error, children }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

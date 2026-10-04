import { useId } from 'react';

/* DESIGN.md §8 Inputs: 32 px tall for one line, line-strong border, radius 6, accent ring. */
export const INPUT_CLASSES =
  'w-full rounded-sm border border-line-strong bg-panel-solid px-3 py-1.5 text-base text-ink placeholder:text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40';

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

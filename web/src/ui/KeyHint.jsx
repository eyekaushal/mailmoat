/**
 * A keyboard key as a small chip, used in tooltips and the hint bar.
 * @param {{ children: import('react').ReactNode }} props
 */
export function KeyHint({ children }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong bg-panel-solid px-1 font-sans text-xs font-medium text-secondary">
      {children}
    </kbd>
  );
}

import { ArrowSquareOut } from '@phosphor-icons/react';

/* DESIGN.md §8: one primary per view; the rest quiet. Destructive = quiet with danger text. */
const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:bg-accent/90',
  secondary: 'border border-line-strong bg-panel-solid text-ink hover:bg-surface-2',
  danger: 'text-danger hover:bg-danger-soft',
  ghost: 'text-secondary hover:bg-surface-2 hover:text-ink',
};

const BASE =
  'inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-base font-medium transition-colors duration-150 ease-out-soft disabled:cursor-not-allowed disabled:opacity-45';

/**
 * The button look for an element that is not a `<button>` (a download link, for instance).
 * @param {keyof typeof VARIANTS} [variant]
 * @param {string} [className]
 */
export function buttonClasses(variant = 'primary', className = '') {
  return `${BASE} ${VARIANTS[variant]} ${className}`;
}

/**
 * @param {{ variant?: keyof typeof VARIANTS, className?: string } &
 *   import('react').ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function Button({ variant = 'primary', className = '', type = 'button', ...rest }) {
  return <button type={type} className={`${BASE} ${VARIANTS[variant]} ${className}`} {...rest} />;
}

/**
 * A button that opens an external page in a new tab; the icon makes the hand-off explicit.
 * @param {{ href: string, variant?: keyof typeof VARIANTS, className?: string, children: import('react').ReactNode }} props
 */
export function ExternalButton({ href, variant = 'primary', className = '', children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${BASE} ${VARIANTS[variant]} ${className}`}
    >
      {children}
      <ArrowSquareOut aria-hidden="true" size={16} />
    </a>
  );
}

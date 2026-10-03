import { ExternalLink } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:opacity-90',
  secondary: 'border border-line bg-surface text-fg hover:bg-surface-2',
  danger: 'border border-danger/40 bg-danger-soft text-danger hover:opacity-90',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';

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
      <ExternalLink aria-hidden="true" className="size-4" />
    </a>
  );
}

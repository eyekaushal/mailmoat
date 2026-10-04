/**
 * A translucent, blurred panel over the wallpaper (DESIGN.md §7).
 * @param {{ className?: string } & import('react').HTMLAttributes<HTMLElement>} props
 */
export function Panel({ className = '', ...rest }) {
  return <section className={`panel ${className}`} {...rest} />;
}

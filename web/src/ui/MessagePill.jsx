/**
 * The pill that holds a one-line (or growing) message control (PLAN §16, review 5): a white
 * full-radius pill with one hairline, a quiet control on the left (`leading`), the control
 * itself as `children`, and the send arrow on the right (`trailing`). The child draws no ring
 * of its own: it carries `data-inset-focus`, and the pill's hairline becomes the ask gradient
 * while it has focus. Light only; nothing here is dark.
 * @param {{ leading?: import('react').ReactNode, trailing?: import('react').ReactNode,
 *   className?: string, children: import('react').ReactNode }} props
 */
export function MessagePill({ leading = null, trailing = null, className = '', children }) {
  return (
    <div className={`pill flex items-center gap-1.5 py-1.5 pr-2 pl-2 ${className}`}>
      {leading}
      {children}
      {trailing}
    </div>
  );
}

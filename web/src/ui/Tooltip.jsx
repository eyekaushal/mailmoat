import { Tooltip as Radix } from 'radix-ui';
import { KeyHint } from './KeyHint.jsx';

/** Wraps the app once so tooltips share one delay and one skip window (DESIGN.md §8). */
export function TooltipProvider({ children }) {
  return (
    <Radix.Provider delayDuration={300} skipDelayDuration={200}>
      {children}
    </Radix.Provider>
  );
}

/**
 * A tooltip for an icon-only control. The child keeps its own `aria-label`; the tooltip repeats
 * the words for sighted users and adds the keyboard hint when there is one.
 * @param {{ label: string, keys?: string[], side?: 'top' | 'right' | 'bottom' | 'left',
 *   children: import('react').ReactElement }} props
 */
export function Tooltip({ label, keys, side = 'bottom', children }) {
  return (
    <Radix.Root>
      <Radix.Trigger asChild>{children}</Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="pop z-50 flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-ink select-none"
        >
          {label}
          {keys?.map((key) => (
            <KeyHint key={key}>{key}</KeyHint>
          ))}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}

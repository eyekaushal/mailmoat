import { Lock } from '@phosphor-icons/react';
import { Switch as Radix } from 'radix-ui';

/**
 * An on/off switch. `locked` renders it on and disabled with a lock, for rules that always run.
 * @param {{ checked: boolean, onCheckedChange?: (checked: boolean) => void, locked?: boolean,
 *   disabled?: boolean, 'aria-label': string, id?: string }} props
 */
export function Switch({ checked, onCheckedChange, locked = false, disabled = false, ...rest }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Radix.Root
        checked={locked ? true : checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled || locked}
        className="relative h-4 w-7 shrink-0 rounded-full bg-line-strong transition-colors duration-150 ease-out-soft data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
        {...rest}
      >
        <Radix.Thumb className="block size-3 translate-x-0.5 rounded-full bg-panel-solid shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-150 ease-out-soft data-[state=checked]:translate-x-3.5" />
      </Radix.Root>
      {locked && <Lock aria-label="Always on" size={12} className="text-tertiary" />}
    </span>
  );
}

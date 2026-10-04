import { Check } from '@phosphor-icons/react';
import { Checkbox as Radix } from 'radix-ui';

/**
 * A 16 px checkbox (DESIGN.md §8).
 * @param {{ checked: boolean | 'indeterminate', onCheckedChange?: (checked: boolean) => void,
 *   disabled?: boolean, 'aria-label': string, id?: string }} props
 */
export function Checkbox({ checked, onCheckedChange, disabled = false, ...rest }) {
  return (
    <Radix.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-line-strong bg-panel-solid text-accent-fg transition-colors duration-150 ease-out-soft data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
      {...rest}
    >
      <Radix.Indicator>
        {checked === 'indeterminate' ? (
          <span className="block h-0.5 w-2 rounded-sm bg-accent-fg" />
        ) : (
          <Check size={12} weight="bold" />
        )}
      </Radix.Indicator>
    </Radix.Root>
  );
}

import { X } from '@phosphor-icons/react';
import { KeyHint } from '../ui/KeyHint.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';

/** The hints shown along the bottom (DESIGN.md §7); `?` opens the full list (`KeyboardHelp`). */
export const KEY_HINTS = Object.freeze([
  { keys: ['/'], text: 'to search' },
  { keys: ['e'], text: 'to archive' },
  { keys: ['r'], text: 'to reply' },
  { keys: ['j', 'k'], text: 'to move' },
  { keys: ['?'], text: 'for help' },
]);

/**
 * The dismissible keyboard-hint bar along the bottom of the window.
 * @param {{ onDismiss: () => void }} props
 */
export function KeyHintBar({ onDismiss }) {
  return (
    <div
      role="note"
      aria-label="Keyboard hints"
      className="flex h-9 shrink-0 items-center justify-center pb-2 text-sm text-secondary"
    >
      <div className="rail flex h-7 items-center gap-3 rounded-full pr-1 pl-3">
        <span className="hidden sm:inline">Hit</span>
        {KEY_HINTS.map(({ keys, text }, index) => (
          <span key={text} className="flex items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden="true" className="mr-1.5 text-tertiary">
                ·
              </span>
            )}
            {keys.map((key) => (
              <KeyHint key={key}>{key}</KeyHint>
            ))}
            <span>{text}</span>
          </span>
        ))}
        <Tooltip label="Hide keyboard hints" side="top">
          <button
            type="button"
            aria-label="Hide keyboard hints"
            onClick={onDismiss}
            className="rounded-full p-1 text-tertiary transition-colors duration-150 ease-out-soft hover:bg-surface-2 hover:text-ink"
          >
            <X size={14} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

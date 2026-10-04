import { X } from '@phosphor-icons/react';
import { KeyHint } from '../ui/KeyHint.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';

/** The hints shown along the bottom (DESIGN.md §7); the keys themselves are wired in R07. */
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
      className="rail relative flex h-9 shrink-0 items-center justify-center gap-3 px-3 text-sm text-secondary"
    >
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
          className="absolute right-3 rounded-md p-1 text-tertiary transition-colors duration-150 ease-out-soft hover:bg-surface-2 hover:text-ink"
        >
          <X size={14} />
        </button>
      </Tooltip>
    </div>
  );
}

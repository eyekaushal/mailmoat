import { Dialog } from '../ui/Dialog.jsx';
import { KeyHint } from '../ui/KeyHint.jsx';

/** Every shortcut the dashboard answers to; `?` opens this list (DESIGN.md §7). */
export const SHORTCUTS = Object.freeze([
  { keys: ['/'], text: 'Search your mail' },
  { keys: ['j', 'k'], text: 'Move down and up the list' },
  { keys: ['↵'], text: 'Open the selected email' },
  { keys: ['e'], text: 'Archive' },
  { keys: ['r'], text: 'Reply' },
  { keys: ['?'], text: 'Show this list' },
  { keys: ['esc'], text: 'Close' },
]);

/** @param {{ open: boolean, onOpenChange: (open: boolean) => void }} props */
export function KeyboardHelp({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts">
      <dl className="space-y-2">
        {SHORTCUTS.map(({ keys, text }) => (
          <div key={text} className="flex items-center gap-3">
            <dt className="flex w-16 shrink-0 gap-1">
              {keys.map((key) => (
                <KeyHint key={key}>{key}</KeyHint>
              ))}
            </dt>
            <dd className="text-base">{text}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}

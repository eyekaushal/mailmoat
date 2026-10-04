import { MagnifyingGlass } from '@phosphor-icons/react';
import { useState } from 'react';
import { KeyHint } from './KeyHint.jsx';

/**
 * The search line at the top of a list (DESIGN.md §8), opened with `/`. Enter submits the
 * trimmed text, Escape closes the line and keeps whatever was shown before.
 * @param {{ initial?: string, placeholder?: string, onSubmit: (query: string) => void,
 *   onClose: () => void }} props
 */
export function SearchLine({ initial = '', placeholder = 'Search your mail', onSubmit, onClose }) {
  const [text, setText] = useState(initial);

  function onKeyDown(event) {
    if (event.key === 'Enter') {
      const query = text.trim();
      if (query) onSubmit(query);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div role="search" className="flex h-9 min-w-0 flex-1 items-center gap-2">
      <MagnifyingGlass aria-hidden="true" size={18} className="shrink-0 text-secondary" />
      <input
        type="search"
        aria-label="Search"
        autoFocus
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="h-9 min-w-0 flex-1 bg-transparent text-xl font-medium tracking-tight text-ink outline-none placeholder:font-normal placeholder:text-tertiary [&::-webkit-search-cancel-button]:hidden"
      />
      <KeyHint>esc</KeyHint>
    </div>
  );
}

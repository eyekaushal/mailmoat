import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { isTyping } from '../../lib/keyboard.js';
import { termsOf } from '../../ui/Highlight.jsx';
import { IconButton } from '../../ui/IconButton.jsx';
import { SearchLine } from '../../ui/SearchLine.jsx';
import { EmailList } from './EmailList.jsx';
import { InboxTabs, queryForTab } from './InboxTabs.jsx';
import { ReadingView } from './ReadingView.jsx';

/**
 * The inbox (PLAN §13.5): title row with the search line, label tabs, the list grouped by day.
 * Tab and query live in the URL so they survive opening an email. An open email takes the whole
 * column (`ReadingView`); the right panel is the shell's `Aside`.
 */
export function InboxPage() {
  const { gmailId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const tab = params.get('tab') ?? 'all';
  const q = params.get('q') ?? '';
  const suffix = params.size > 0 ? `?${params}` : '';
  const query = q ? `/search?q=${encodeURIComponent(q)}` : queryForTab(tab);
  const terms = useMemo(() => termsOf(q), [q]);

  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      setParams(next);
    },
    [params, setParams],
  );

  useEffect(() => {
    function onKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === '/') {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === 'Escape' && q && !searchOpen) {
        update({ q: null });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [q, searchOpen, update]);

  if (gmailId) {
    return (
      <ReadingView key={gmailId} gmailId={gmailId} onClose={() => navigate(`/inbox${suffix}`)} />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-5">
        {searchOpen ? (
          <SearchLine
            initial={q}
            onSubmit={(text) => {
              update({ q: text });
              setSearchOpen(false);
            }}
            onClose={() => setSearchOpen(false)}
          />
        ) : (
          <>
            <h1 className="min-w-0 truncate text-xl font-medium tracking-tight">{q || 'Inbox'}</h1>
            {q && <IconButton label="Clear search" icon={X} onClick={() => update({ q: null })} />}
            <IconButton
              className="ml-auto"
              label="Search"
              keys={['/']}
              icon={MagnifyingGlass}
              onClick={() => setSearchOpen(true)}
            />
          </>
        )}
      </header>
      {q ? (
        <p className="h-9 px-5 text-sm text-secondary">Results from Gmail, newest first</p>
      ) : (
        <InboxTabs
          active={tab}
          onChange={(next) => update({ tab: next === 'all' ? null : next })}
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        <EmailList
          key={query}
          query={query}
          terms={terms}
          onOpen={(id) => navigate(`/inbox/${id}${suffix}`)}
        />
      </div>
    </div>
  );
}

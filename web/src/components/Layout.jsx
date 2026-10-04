import { useEffect, useState } from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router';
import { isTyping } from '../lib/keyboard.js';
import { useApi } from '../lib/useApi.js';
import { Aside } from './Aside.jsx';
import { KeyHintBar } from './KeyHintBar.jsx';
import { KeyboardHelp } from './KeyboardHelp.jsx';
import { LoadingState } from './LoadingState.jsx';
import { Rail } from './Rail.jsx';
import { Wallpaper } from './Wallpaper.jsx';
import { AskAiProvider, useAskAi } from './ask/AskAiProvider.jsx';
import { AskPanel } from './ask/AskPanel.jsx';

const KEY_HINTS_STORAGE = 'mailmoat.keyHints';

function readKeyHintsHidden() {
  try {
    return window.localStorage.getItem(KEY_HINTS_STORAGE) === 'hidden';
  } catch {
    return false;
  }
}

function writeKeyHintsHidden(hidden) {
  try {
    if (hidden) window.localStorage.setItem(KEY_HINTS_STORAGE, 'hidden');
    else window.localStorage.removeItem(KEY_HINTS_STORAGE);
  } catch {
    // Private windows may refuse storage; the bar then simply comes back next time.
  }
}

/**
 * The app shell (DESIGN.md §7): wallpaper, icon rail, the Ask AI side panel when open, the
 * current screen on a translucent panel, the right panel and the keyboard-hint bar. Until both
 * the Anthropic key and Google are set up, every screen hands over to the setup wizard (PRD F1).
 */
export function Layout() {
  const { data: health, error } = useApi('/health');
  if (!health && !error) return <LoadingState label="Starting mailmoat…" />;
  if (health && !(health.anthropic?.configured && health.google?.connected)) {
    return <Navigate to="/setup" replace />;
  }
  return (
    <AskAiProvider>
      <Shell />
    </AskAiProvider>
  );
}

function Shell() {
  const ask = useAskAi();
  const [params, setParams] = useSearchParams();
  const [hintsHidden, setHintsHidden] = useState(readKeyHintsHidden);
  const [helpOpen, setHelpOpen] = useState(false);

  // `?ask=1` deep-links to the panel (the demo and README use it); the param is consumed once.
  const askParam = params.get('ask');
  useEffect(() => {
    if (askParam !== '1') return;
    ask.show();
    const next = new URLSearchParams(params);
    next.delete('ask');
    setParams(next, { replace: true });
  }, [askParam, ask, params, setParams]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === '?') {
        event.preventDefault();
        setHelpOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function setHints(hidden) {
    writeKeyHintsHidden(hidden);
    setHintsHidden(hidden);
  }

  return (
    <div className="flex h-full flex-col">
      <Wallpaper />
      <div className="flex min-h-0 flex-1">
        <Rail onShowKeyHints={() => setHints(false)} />
        <div className="flex min-w-0 flex-1 gap-2 p-2 pl-0">
          {ask.isOpen && <AskPanel />}
          <main className="panel flex min-w-0 flex-1 flex-col overflow-y-auto">
            <Outlet />
          </main>
          <Aside />
        </div>
      </div>
      {!hintsHidden && <KeyHintBar onDismiss={() => setHints(true)} />}
      <KeyboardHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

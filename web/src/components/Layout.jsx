import { useState } from 'react';
import { Navigate, Outlet } from 'react-router';
import { useApi } from '../lib/useApi.js';
import { Aside } from './Aside.jsx';
import { KeyHintBar } from './KeyHintBar.jsx';
import { LoadingState } from './LoadingState.jsx';
import { Rail } from './Rail.jsx';
import { Wallpaper } from './Wallpaper.jsx';

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
 * The app shell (DESIGN.md §7): wallpaper, icon rail, the current screen on a translucent panel
 * and the keyboard-hint bar. Until both the Anthropic key and Google are set up, every screen
 * hands over to the setup wizard (PRD F1).
 */
export function Layout() {
  const { data: health, error } = useApi('/health');
  const [hintsHidden, setHintsHidden] = useState(readKeyHintsHidden);
  if (!health && !error) return <LoadingState label="Starting mailmoat…" />;
  if (health && !(health.anthropic?.configured && health.google?.connected)) {
    return <Navigate to="/setup" replace />;
  }

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
          <main className="panel flex min-w-0 flex-1 flex-col overflow-y-auto">
            <Outlet />
          </main>
          <Aside />
        </div>
      </div>
      {!hintsHidden && <KeyHintBar onDismiss={() => setHints(true)} />}
    </div>
  );
}

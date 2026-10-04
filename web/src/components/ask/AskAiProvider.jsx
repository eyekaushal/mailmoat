import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const STORAGE = 'mailmoat.askAi';

const AskAiContext = createContext({
  isOpen: false,
  emailId: null,
  show: () => {},
  hide: () => {},
  toggle: () => {},
  forgetEmail: () => {},
});

function readOpen() {
  try {
    return window.localStorage.getItem(STORAGE) === 'open';
  } catch {
    return false;
  }
}

function writeOpen(open) {
  try {
    if (open) window.localStorage.setItem(STORAGE, 'open');
    else window.localStorage.removeItem(STORAGE);
  } catch {
    // Private windows may refuse storage; the panel then simply starts closed next time.
  }
}

/**
 * Whether the Ask AI side panel is open and which email it was opened from (PLAN §13.9). The
 * rail toggles it, the reading view opens it with an email, the panel closes itself.
 * @param {{ children: import('react').ReactNode }} props
 */
export function AskAiProvider({ children }) {
  const [isOpen, setOpen] = useState(readOpen);
  const [emailId, setEmailId] = useState(null);

  const show = useCallback((options = {}) => {
    if (options.emailId !== undefined) setEmailId(options.emailId);
    writeOpen(true);
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    writeOpen(false);
    setOpen(false);
  }, []);
  const toggle = useCallback(() => {
    setOpen((open) => {
      writeOpen(!open);
      return !open;
    });
  }, []);
  const forgetEmail = useCallback(() => setEmailId(null), []);

  const value = useMemo(
    () => ({ isOpen, emailId, show, hide, toggle, forgetEmail }),
    [isOpen, emailId, show, hide, toggle, forgetEmail],
  );
  return <AskAiContext.Provider value={value}>{children}</AskAiContext.Provider>;
}

export function useAskAi() {
  return useContext(AskAiContext);
}

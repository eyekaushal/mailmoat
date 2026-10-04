import {
  ClockCounterClockwise,
  PaperPlaneRight,
  Plus,
  Sparkle,
  Trash,
  X,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { applyEvent, emptyTurn } from '../../lib/chatTurn.js';
import { useApi, useApiClient } from '../../lib/useApi.js';
import { Dialog } from '../../ui/Dialog.jsx';
import { DropdownMenu, MenuHeader, MenuItem, MenuSeparator } from '../../ui/DropdownMenu.jsx';
import { IconButton } from '../../ui/IconButton.jsx';
import { Button } from '../Button.jsx';
import { useAskAi } from './AskAiProvider.jsx';
import { AskTurn } from './AskTurn.jsx';

export const PROMPT = 'Find, write, schedule, or ask anything';

export const SUGGESTIONS = [
  'What needs a reply today?',
  'Summarise what Rahul sent this week',
  'Draft a reply saying we will pay on Friday',
  'Find 30 minutes with Mia next week',
];

/**
 * The Ask AI side panel (PRD F8, PLAN §13.9): a centred prompt and suggestion chips until the
 * first question, then plain-text answers with numbered sources and preview cards. Your words
 * are trusted input to the Planner; anything that would change something comes back as a card
 * and waits for your click. Chats are kept; recent ones open from the clock menu.
 */
export function AskPanel() {
  const client = useApiClient();
  const { emailId, hide, forgetEmail } = useAskAi();
  const { data: chats, mutate: mutateChats } = useApi('/chats');
  const [chatId, setChatId] = useState(null);
  const { data: chat, mutate: mutateChat } = useApi(chatId ? `/chats/${chatId}` : null);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState(null);
  const [error, setError] = useState(null);
  const [busyCard, setBusyCard] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const bottom = useRef(null);
  const input = useRef(null);

  const messages = chat?.messages ?? [];
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, live]);
  useEffect(() => {
    input.current?.focus?.();
  }, [chatId, emailId]);

  const decided = new Set(messages.map((m) => m.content?.approvalId).filter(Boolean));

  async function send(event) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || live) return;
    setDraft('');
    setError(null);
    let turn = emptyTurn();
    let targetId = chatId;
    setLive({ user: text, turn });
    try {
      await client.stream(
        '/chat',
        { ...(chatId ? { chatId } : {}), message: text, ...(emailId ? { emailId } : {}) },
        (name, data) => {
          if (name === 'chat' && data.type === 'chat') {
            targetId = data.chatId;
            return;
          }
          if (name === 'chat') {
            turn = applyEvent(turn, data);
            setLive({ user: text, turn });
          } else if (name === 'error') {
            setError(data.message);
          }
        },
      );
    } catch (caught) {
      setError(caught.message);
    }
    setLive(null);
    await mutateChats();
    if (targetId && targetId !== chatId) setChatId(targetId);
    else await mutateChat();
  }

  async function decide(approvalId, action) {
    setBusyCard(approvalId);
    setError(null);
    try {
      await client.post(`/chats/${chatId}/decide`, { approvalId, action });
      await mutateChat();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusyCard(null);
    }
  }

  async function remove() {
    setDeleting(false);
    setError(null);
    try {
      await client.delete(`/chats/${chatId}`);
      setChatId(null);
      await mutateChats();
    } catch (caught) {
      setError(caught.message);
    }
  }

  const empty = !chatId && !live;
  return (
    <aside aria-label="Ask AI" className="panel flex w-[380px] shrink-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-4">
        <Sparkle aria-hidden="true" size={18} className="text-accent" />
        <h2 className="min-w-0 flex-1 truncate pl-1 text-md font-medium tracking-tight">
          {chat?.title ?? 'Ask AI'}
        </h2>
        {chatId && <IconButton label="New chat" icon={Plus} onClick={() => setChatId(null)} />}
        <DropdownMenu
          align="end"
          trigger={<IconButton label="Recent chats" icon={ClockCounterClockwise} />}
        >
          {(chats ?? []).length === 0 ? (
            <MenuHeader>
              <span className="text-sm text-secondary">No chats yet.</span>
            </MenuHeader>
          ) : (
            (chats ?? []).slice(0, 12).map((entry) => (
              <MenuItem key={entry.id} onSelect={() => setChatId(entry.id)}>
                <span className="truncate">{entry.title ?? 'New chat'}</span>
              </MenuItem>
            ))
          )}
          {chatId && (
            <>
              <MenuSeparator />
              <MenuItem icon={Trash} danger onSelect={() => setDeleting(true)}>
                Delete this chat
              </MenuItem>
            </>
          )}
        </DropdownMenu>
        <IconButton label="Close Ask AI" icon={X} onClick={hide} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-4 py-4">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-md font-medium">{PROMPT}</p>
            <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Suggestions">
              {SUGGESTIONS.map((text) => (
                <li key={text}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(text);
                      input.current?.focus?.();
                    }}
                    className="rounded-full bg-surface-2 px-3 py-1 text-sm text-secondary transition-colors duration-150 ease-out-soft hover:bg-surface-3 hover:text-ink"
                  >
                    {text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <AskTurn
                key={message.id}
                message={message}
                decided={decided}
                onDecide={decide}
                busy={busyCard !== null}
              />
            ))}
            {live && (
              <>
                <AskTurn message={{ role: 'user', content: { text: live.user } }} />
                <AskTurn message={{ role: 'assistant', content: live.turn }} live />
              </>
            )}
            <div ref={bottom} />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <form onSubmit={send} className="shrink-0 border-t border-line px-4 py-3">
        {emailId && (
          <p className="mb-1.5 flex items-center gap-1 text-xs text-secondary">
            <span className="min-w-0 flex-1 truncate">About the email you opened this from.</span>
            <IconButton
              label="Forget this email"
              icon={X}
              size={12}
              className="size-5"
              onClick={forgetEmail}
            />
          </p>
        )}
        <div className="flex items-end gap-1 rounded-sm border border-line-strong bg-panel-solid pr-1 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40">
          <textarea
            ref={input}
            data-inset-focus=""
            aria-label="Message"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask anything… Shift+Enter for a new line"
            className="min-h-10 w-full resize-none bg-transparent px-3 py-2 text-base text-ink outline-none placeholder:text-tertiary"
            disabled={live !== null}
          />
          <IconButton
            label="Send"
            keys={['↵']}
            icon={PaperPlaneRight}
            type="submit"
            className="mb-1"
            disabled={!draft.trim() || live !== null}
          />
        </div>
      </form>

      <Dialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this chat?"
        description="Its history is removed from this Mac. Anything already sent or saved stays where it is."
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button onClick={remove}>Delete</Button>
          </>
        }
      />
    </aside>
  );
}

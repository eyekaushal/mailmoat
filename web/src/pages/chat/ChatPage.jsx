import { MessageSquarePlus, SendHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Button } from '../../components/Button.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { INPUT_CLASSES } from '../../components/FormField.jsx';
import { useApi, useApiClient } from '../../lib/useApi.js';
import { ChatMessage } from './ChatMessage.jsx';

const EXAMPLES = [
  'What did Rahul send this week?',
  'Draft a reply to the latest invoice email saying we will pay on Friday.',
  'Find 30 minutes with Mia next week for a launch review.',
];

function emptyTurn() {
  return {
    text: '',
    intent: 'none',
    status: 'running',
    steps: [],
    cards: [],
    results: [],
    statusText: '',
  };
}

/** Folds one streamed event into the turn being shown live. */
export function applyEvent(turn, event) {
  switch (event.type) {
    case 'status':
      return { ...turn, statusText: event.text };
    case 'step': {
      const others = turn.steps.filter((s) => s.step !== event.step);
      return {
        ...turn,
        steps: [...others, { ...event }].sort((a, b) => a.step - b.step),
        statusText: event.label,
      };
    }
    case 'result':
      return { ...turn, results: [...turn.results, event] };
    case 'card':
      return { ...turn, cards: [...turn.cards, event.card] };
    case 'message':
      return { ...turn, text: event.text, statusText: '' };
    default:
      return turn;
  }
}

/**
 * "Ask mailmoat" (PRD F8): chats on the left, the conversation and composer on the right. Your
 * words are trusted input to the Planner; everything that would change something comes back as a
 * card and waits for your click.
 */
export function ChatPage() {
  const client = useApiClient();
  const navigate = useNavigate();
  const { chatId } = useParams();
  const [params] = useSearchParams();
  const emailId = params.get('emailId');
  const { data: chats, mutate: mutateChats } = useApi('/chats');
  const { data: chat, mutate: mutateChat } = useApi(chatId ? `/chats/${chatId}` : null);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState(null);
  const [error, setError] = useState(null);
  const [busyCard, setBusyCard] = useState(null);
  const bottom = useRef(null);

  const messages = chat?.messages ?? [];
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, live]);

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
    if (targetId && targetId !== chatId)
      navigate(`/chat/${targetId}${emailId ? `?emailId=${emailId}` : ''}`);
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

  async function remove(id) {
    if (!window.confirm('Delete this chat? Its history is removed from this Mac.')) return;
    await client.delete(`/chats/${id}`);
    await mutateChats();
    if (id === chatId) navigate('/chat');
  }

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line md:flex">
        <div className="p-3">
          <Button variant="secondary" className="w-full" onClick={() => navigate('/chat')}>
            <MessageSquarePlus aria-hidden="true" className="size-4" /> New chat
          </Button>
        </div>
        <ul className="flex-1 overflow-y-auto px-2" aria-label="Chats">
          {(chats ?? []).map((entry) => (
            <li key={entry.id} className="group flex items-center">
              <button
                type="button"
                onClick={() => navigate(`/chat/${entry.id}`)}
                aria-current={entry.id === chatId ? 'true' : undefined}
                className={`min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm ${entry.id === chatId ? 'bg-accent-soft text-accent' : 'hover:bg-surface-2'}`}
              >
                {entry.title ?? 'New chat'}
              </button>
              <button
                type="button"
                aria-label={`Delete chat ${entry.title ?? ''}`}
                onClick={() => remove(entry.id)}
                className="p-1 text-muted opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100"
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6 sm:px-8">
          {!chatId && !live && (
            <EmptyState
              title="Ask mailmoat"
              description="Find or summarise emails, draft or send replies, schedule meetings. Anything that changes something is shown as a card first."
              action={
                <ul className="mt-2 space-y-1 text-sm">
                  {EXAMPLES.map((example) => (
                    <li key={example}>
                      <button
                        type="button"
                        onClick={() => setDraft(example)}
                        className="rounded-md border border-line px-3 py-1.5 text-left text-muted hover:bg-surface-2 hover:text-fg"
                      >
                        {example}
                      </button>
                    </li>
                  ))}
                </ul>
              }
            />
          )}
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              decided={decided}
              onDecide={decide}
              busy={busyCard !== null}
            />
          ))}
          {live && (
            <>
              <ChatMessage message={{ role: 'user', content: { text: live.user } }} />
              <ChatMessage message={{ role: 'assistant', content: live.turn }} live />
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div ref={bottom} />
        </div>
        <form onSubmit={send} className="border-t border-line p-3 sm:px-8">
          {emailId && (
            <p className="mb-1 text-xs text-muted">About the email you opened this from.</p>
          )}
          <div className="flex gap-2">
            <textarea
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
              placeholder="Ask mailmoat… (Enter to send, Shift+Enter for a new line)"
              className={`${INPUT_CLASSES} resize-none`}
              disabled={live !== null}
            />
            <Button type="submit" disabled={!draft.trim() || live !== null} aria-label="Send">
              <SendHorizontal aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

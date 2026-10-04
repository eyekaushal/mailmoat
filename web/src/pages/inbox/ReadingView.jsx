import {
  Archive,
  ArrowBendUpLeft,
  ArrowLeft,
  CalendarPlus,
  Sparkle,
  UserCheck,
  UserMinus,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSWRConfig } from 'swr';
import { Button } from '../../components/Button.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PipelineTrace } from '../../components/PipelineTrace.jsx';
import { useAskAi } from '../../components/ask/AskAiProvider.jsx';
import { isTyping } from '../../lib/keyboard.js';
import { useApi, useApiClient } from '../../lib/useApi.js';
import { Dialog } from '../../ui/Dialog.jsx';
import { IconButton } from '../../ui/IconButton.jsx';
import { Tag, labelFor, riskLabelFor } from '../../ui/Tag.jsx';
import { MeetingCard } from './MeetingCard.jsx';
import { ThreadMessage } from './ThreadMessage.jsx';

/** Which messages start open: the newest one, and the one the user clicked if it is older. */
export function defaultExpanded(messages, gmailId) {
  const latest = messages.at(-1)?.gmailId;
  return new Set([latest, gmailId].filter(Boolean));
}

/**
 * The reading view (PLAN §13.6): back arrow, subject, the category and risk tags, the whole
 * conversation with earlier messages collapsed, the actions as icons with keys, and, for flagged
 * mail only, "Why was this flagged?" opening the pipeline trace. Plain text everywhere; the
 * subject and body come from the thread route, which never stores them.
 * @param {{ gmailId: string, onClose?: () => void, now?: Date }} props
 */
export function ReadingView({ gmailId, onClose, now }) {
  const client = useApiClient();
  const { mutate: mutateAll } = useSWRConfig();
  const ask = useAskAi();
  const { data, error, mutate } = useApi(`/emails/${gmailId}`);
  const threadId = data?.email.threadId ?? null;
  const { data: thread, error: threadError } = useApi(threadId ? `/threads/${threadId}` : null);
  const [expanded, setExpanded] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  // Security Center links here with `?trace=1`, so the explanation opens with the email.
  const [params] = useSearchParams();
  const [whyOpen, setWhyOpen] = useState(params.get('trace') === '1');
  const { data: trace } = useApi(whyOpen ? `/emails/${gmailId}/trace` : null);

  const verdict = data?.verdict ?? null;
  const level = verdict?.level ?? null;
  const dangerous = level === 'DANGEROUS';
  const flagged = verdict !== null && level !== 'SAFE';
  const canReply = data?.email.direction === 'inbound' && !dangerous;
  const notPhishing = verdict?.userFeedback === 'not_phishing';

  async function run(name, work) {
    setBusy(name);
    setNotice(null);
    try {
      const text = await work();
      if (text) setNotice({ ok: true, text });
      await mutate();
      await mutateAll((key) => typeof key === 'string' && key.startsWith('/emails'));
    } catch (caught) {
      setNotice({ ok: false, text: caught.message });
    } finally {
      setBusy(null);
    }
  }

  const createDraft = (allowSuspicious) =>
    run('draft', async () => {
      await client.post(`/emails/${gmailId}/draft-reply`, { allowSuspicious });
      return 'Draft saved in Gmail Drafts. Nothing is sent until you send it.';
    });

  function draftReply() {
    if (!data || busy || !canReply) return;
    if (level === 'SUSPICIOUS') {
      setConfirm({
        title: 'Reply to a suspicious email?',
        description:
          'The draft is written from an email that was flagged. Read it carefully before you send anything.',
        action: 'Draft anyway',
        run: () => createDraft(true),
      });
      return;
    }
    createDraft(false);
  }

  function archive() {
    if (!data || busy) return;
    run('archive', async () => {
      const result = await client.post(`/emails/${gmailId}/archive`);
      if (!result.done) return `Not archived: ${result.reason}`;
      onClose?.();
      return null;
    });
  }

  const trust = () =>
    run('trust', async () => {
      const { trusted } = await client.post(`/emails/${gmailId}/trust-sender`, {
        trusted: !data.sender.trusted,
      });
      return trusted
        ? 'Sender marked trusted. This only stops first-time-sender warnings; risk levels never go down.'
        : 'Trust removed.';
    });

  const propose = (allowRisky) =>
    run('meeting', async () => {
      setProposal(await client.post(`/emails/${gmailId}/propose-meeting`, { allowRisky }));
      return null;
    });

  function proposeMeeting() {
    if (level === 'SUSPICIOUS') {
      setConfirm({
        title: 'Propose a meeting from a suspicious email?',
        description:
          'The times come from an email that was flagged. Nothing is saved until you do.',
        action: 'Propose anyway',
        run: () => propose(true),
      });
      return;
    }
    propose(false);
  }

  const feedback = () =>
    run('feedback', async () => {
      await client.post(`/emails/${gmailId}/not-phishing`, { notPhishing: !notPhishing });
      return notPhishing
        ? 'Feedback withdrawn.'
        : 'Recorded as not phishing. The level stays as a record of what was found.';
    });

  useEffect(() => {
    function onKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === 'r') {
        event.preventDefault();
        draftReply();
      } else if (event.key === 'e') {
        event.preventDefault();
        archive();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (error)
    return (
      <p role="alert" className="p-5 text-sm text-danger">
        {error.message}
      </p>
    );
  if (!data) return <LoadingState label="Opening email…" />;

  const { readerForm, rules, sender } = data;
  const label = labelFor(rules.map((item) => item.ruleId));
  const risk = riskLabelFor(verdict);
  const messages = thread?.messages ?? [];
  const opened = messages.find((message) => message.gmailId === gmailId);
  const subject =
    opened?.subject ??
    messages.findLast((message) => !message.unreadable)?.subject ??
    (thread ? '(no subject)' : null);
  const open = expanded ?? defaultExpanded(messages, gmailId);
  const toggle = (id) =>
    setExpanded((previous) => {
      const next = new Set(previous ?? defaultExpanded(messages, gmailId));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <article className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-3">
        {onClose && <IconButton label="Back to inbox" icon={ArrowLeft} onClick={onClose} />}
        <h1 className="min-w-0 flex-1 truncate text-xl font-medium tracking-tight">
          {subject ?? <span className="text-secondary">Opening…</span>}
        </h1>
        {label && <Tag label={label} />}
        {risk && <Tag label={risk} />}
        <div className="ml-2 flex items-center gap-0.5">
          <IconButton
            label={
              dangerous
                ? 'Replies are never drafted for dangerous mail'
                : canReply
                  ? 'Reply'
                  : 'Reply is only for mail you received'
            }
            keys={canReply ? ['r'] : undefined}
            icon={ArrowBendUpLeft}
            onClick={draftReply}
            disabled={busy !== null || !canReply}
          />
          <IconButton
            label="Archive"
            keys={['e']}
            icon={Archive}
            onClick={archive}
            disabled={busy !== null}
          />
          <IconButton
            label={sender.trusted ? 'Remove trust' : 'Mark sender trusted'}
            icon={sender.trusted ? UserMinus : UserCheck}
            onClick={trust}
            disabled={busy !== null}
          />
          {readerForm?.meeting_request && (
            <IconButton
              label={
                dangerous ? 'Meetings are never proposed from dangerous mail' : 'Propose meeting'
              }
              icon={CalendarPlus}
              onClick={proposeMeeting}
              disabled={busy !== null || dangerous}
            />
          )}
          <IconButton
            label="Ask AI about this email"
            icon={Sparkle}
            onClick={() => ask.show({ emailId: gmailId })}
          />
        </div>
      </header>

      {notice && (
        <p
          role="status"
          className={`shrink-0 px-5 pb-2 text-sm ${notice.ok ? 'text-secondary' : 'text-danger'}`}
        >
          {notice.text}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        {proposal && (
          <div className="px-5 pt-4">
            <MeetingCard
              proposal={proposal}
              onCancel={() => setProposal(null)}
              onSaved={({ link }) => {
                setProposal(null);
                setNotice({
                  ok: true,
                  text: `Event created and invitations sent. ${link ?? ''}`.trim(),
                });
              }}
            />
          </div>
        )}
        {threadError && (
          <p role="alert" className="px-5 py-3 text-sm text-danger">
            Could not load the conversation: {threadError.message}
          </p>
        )}
        {!thread && !threadError && <LoadingState label="Opening conversation…" />}
        {thread && (
          <ol aria-label="Conversation" className="divide-y divide-line">
            {messages.map((message) => (
              <ThreadMessage
                key={message.gmailId}
                message={message}
                expanded={open.has(message.gmailId)}
                onToggle={() => toggle(message.gmailId)}
                opened={message.gmailId === gmailId}
                summary={message.gmailId === gmailId ? readerForm?.summary : null}
                now={now}
              />
            ))}
          </ol>
        )}
        {thread && flagged && (
          <section aria-label="Why this was flagged" className="border-t border-line px-5 py-4">
            <button
              type="button"
              aria-expanded={whyOpen}
              onClick={() => setWhyOpen((value) => !value)}
              className="text-base text-accent hover:underline"
            >
              Why was this flagged?
            </button>
            {whyOpen &&
              (trace ? (
                <div className="mt-3 space-y-3">
                  <PipelineTrace trace={trace} />
                  <Button variant="ghost" onClick={feedback} disabled={busy !== null}>
                    {notPhishing ? 'Withdraw “not phishing”' : 'Report as not phishing'}
                  </Button>
                </div>
              ) : (
                <LoadingState label="Loading the trace…" />
              ))}
          </section>
        )}
      </div>

      <Dialog
        open={confirm !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfirm(null);
        }}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const { run: go } = confirm;
                setConfirm(null);
                go();
              }}
            >
              {confirm?.action}
            </Button>
          </>
        }
      />
    </article>
  );
}

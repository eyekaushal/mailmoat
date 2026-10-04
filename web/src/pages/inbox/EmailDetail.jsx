import {
  Archive,
  ArrowLeft,
  CalendarPlus,
  ChatCircle,
  Code,
  EyeSlash,
  FileText,
  Paperclip,
  PencilSimpleLine,
  ShieldCheck,
  Sparkle,
  UserCheck,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useSWRConfig } from 'swr';
import { Button } from '../../components/Button.jsx';
import { CategoryBadge } from '../../components/CategoryBadge.jsx';
import { DisarmedLink } from '../../components/DisarmedLink.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PipelineTrace } from '../../components/PipelineTrace.jsx';
import { RiskBadge } from '../../components/RiskBadge.jsx';
import { RiskBanner } from '../../components/RiskBanner.jsx';
import { SafeEmailFrame } from '../../components/SafeEmailFrame.jsx';
import { useApi, useApiClient } from '../../lib/useApi.js';
import { MeetingCard } from './MeetingCard.jsx';

/** Link signals shown inline next to the links they concern (SECURITY_APPROACH §7.7). */
const LINK_SIGNALS = new Set(['S14', 'S15', 'S16', 'S17', 'S18']);

function Mailbox({ box }) {
  if (!box) return null;
  return (
    <span>
      {box.name && <span className="font-medium">{box.name} </span>}
      <span className="font-mono text-xs text-muted">&lt;{box.address}&gt;</span>
    </span>
  );
}

/**
 * One email (PRD F5.3/F5.4): risk banner, AI summary marked untrusted, plain visible text,
 * disarmed links, "view original" in the sandboxed frame, the pipeline trace and the actions.
 * @param {{ gmailId: string, onClose?: () => void }} props
 */
export function EmailDetail({ gmailId, onClose }) {
  const client = useApiClient();
  const { mutate: mutateAll } = useSWRConfig();
  const { data, error, mutate } = useApi(`/emails/${gmailId}`);
  const { data: content, error: contentError } = useApi(`/emails/${gmailId}/content`);
  const [view, setView] = useState('text');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [proposal, setProposal] = useState(null);
  const { data: trace } = useApi(view === 'trace' ? `/emails/${gmailId}/trace` : null);

  if (error)
    return (
      <p role="alert" className="p-6 text-sm text-danger">
        {error.message}
      </p>
    );
  if (!data) return <LoadingState label="Opening email…" />;

  const { email, verdict, readerForm, signals, rules, sender } = data;
  const level = verdict?.level ?? null;
  const dangerous = level === 'DANGEROUS';
  const risky = level !== 'SAFE';
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

  const draftReply = () =>
    run('draft', async () => {
      if (
        level === 'SUSPICIOUS' &&
        !window.confirm(
          'This email is SUSPICIOUS. Draft a reply anyway? Check it carefully before sending.',
        )
      ) {
        return null;
      }
      const { draftId } = await client.post(`/emails/${gmailId}/draft-reply`, {
        allowSuspicious: level === 'SUSPICIOUS',
      });
      return `Draft saved in Gmail Drafts (${draftId}). Nothing is sent until you send it.`;
    });

  const archive = () =>
    run('archive', async () => {
      const result = await client.post(`/emails/${gmailId}/archive`);
      return result.done ? 'Archived.' : `Not archived: ${result.reason}`;
    });

  const trust = () =>
    run('trust', async () => {
      const { trusted } = await client.post(`/emails/${gmailId}/trust-sender`, {
        trusted: !sender.trusted,
      });
      return trusted
        ? 'Sender marked trusted. This only stops first-time-sender warnings; risk levels are never lowered.'
        : 'Trust removed.';
    });

  const feedback = () =>
    run('feedback', async () => {
      await client.post(`/emails/${gmailId}/not-phishing`, { notPhishing: !notPhishing });
      return notPhishing
        ? 'Feedback withdrawn.'
        : 'Recorded as not phishing. The level stays as a record of what was found.';
    });

  const proposeMeeting = () =>
    run('meeting', async () => {
      if (
        level === 'SUSPICIOUS' &&
        !window.confirm('This email is SUSPICIOUS. Propose a meeting from it anyway?')
      ) {
        return null;
      }
      setProposal(
        await client.post(`/emails/${gmailId}/propose-meeting`, {
          allowRisky: level === 'SUSPICIOUS',
        }),
      );
      return null;
    });

  const linkSignals = signals.filter((s) => LINK_SIGNALS.has(s.id));

  return (
    <article className="flex h-full flex-col">
      <header className="space-y-3 border-b border-line px-6 py-4">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg md:hidden"
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Back
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <RiskBadge level={level} />
          {readerForm?.category && <CategoryBadge category={readerForm.category} />}
          {rules.map((run) => (
            <span
              key={run.ruleId}
              className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent"
            >
              {run.ruleId.replaceAll('_', ' ')}
            </span>
          ))}
          <time dateTime={email.date} className="ml-auto text-xs text-muted">
            {new Date(email.date).toLocaleString()}
          </time>
        </div>
        <h1 className="text-lg font-semibold break-words">
          {content ? (
            content.subject || '(no subject)'
          ) : (
            <span className="text-muted">Loading subject…</span>
          )}
        </h1>
        <div className="space-y-0.5 text-sm">
          <p>
            <span className="text-muted">From </span>
            <Mailbox box={content?.from ?? { address: email.fromAddr, name: email.fromName }} />
            {sender.trusted && (
              <span className="ml-2 inline-flex items-center gap-1 rounded bg-safe-soft px-1.5 py-0.5 text-xs text-safe">
                <ShieldCheck aria-hidden="true" className="size-3" /> trusted
              </span>
            )}
            {sender.sentCount === 0 && !sender.trusted && email.direction === 'inbound' && (
              <span className="ml-2 text-xs text-muted">you have never written to this sender</span>
            )}
          </p>
          {content?.to?.length > 0 && (
            <p>
              <span className="text-muted">To </span>
              {content.to.map((box, i) => (
                <span key={box.address}>
                  {i > 0 && ', '}
                  <Mailbox box={box} />
                </span>
              ))}
            </p>
          )}
          {content?.replyTo?.length > 0 &&
            content.replyTo.some((r) => r.address !== content.from?.address) && (
              <p className="text-warn">
                Replies would go to {content.replyTo.map((r) => r.address).join(', ')}, not the
                sender.
              </p>
            )}
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <RiskBanner verdict={verdict} readerForm={readerForm} />

        {readerForm?.summary && (
          <section className="rounded-lg bg-surface-2 p-3 text-sm">
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted">
              <Sparkle aria-hidden="true" className="size-3.5" /> AI summary of an untrusted email
            </p>
            <p className="whitespace-pre-wrap">{readerForm.summary}</p>
          </section>
        )}

        {proposal && (
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
        )}

        <div
          role="tablist"
          aria-label="Email view"
          className="flex gap-1 border-b border-line text-sm"
        >
          {[
            ['text', 'Text', FileText],
            ['original', 'View original', Code],
            ['trace', 'Pipeline trace', ShieldCheck],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 ${view === id ? 'border-accent font-medium' : 'border-transparent text-muted hover:text-fg'}`}
            >
              <Icon aria-hidden="true" className="size-4" /> {label}
            </button>
          ))}
        </div>

        {view === 'text' && (
          <section className="space-y-4">
            {contentError && (
              <p role="alert" className="text-sm text-danger">
                Could not load the message: {contentError.message}
              </p>
            )}
            {!content && !contentError && <LoadingState label="Fetching from Gmail…" />}
            {content && (
              <>
                <pre className="font-sans text-sm whitespace-pre-wrap break-words">
                  {content.text || '(no visible text)'}
                </pre>
                {content.textTruncated && (
                  <p className="text-xs text-muted">Text shortened for display.</p>
                )}
                {content.hidden.length > 0 && (
                  <p className="flex items-center gap-2 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
                    <EyeSlash aria-hidden="true" className="size-4" />
                    {content.hidden.length} hidden {content.hidden.length === 1 ? 'item' : 'items'}{' '}
                    removed from this view (see the pipeline trace).
                  </p>
                )}
                {content.links.length > 0 && (
                  <section>
                    <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                      Links ({content.links.length})
                    </h2>
                    <ul className="space-y-1">
                      {content.links.map((link, index) => (
                        <li key={`${link.href}-${index}`}>
                          <DisarmedLink
                            href={link.href}
                            text={link.text}
                            level={level}
                            signals={index === 0 ? linkSignals : []}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {content.attachments.length > 0 && (
                  <section>
                    <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                      Attachments
                    </h2>
                    <ul className="space-y-1 text-sm">
                      {content.attachments.map((a, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <Paperclip aria-hidden="true" className="size-4 text-muted" />
                          <span className="break-all">{a.filename ?? 'unnamed'}</span>
                          <span className="text-xs text-muted">
                            {a.mimeType ?? a.contentType ?? ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-muted">
                      Attachments are never opened or downloaded by mailmoat.
                    </p>
                  </section>
                )}
              </>
            )}
          </section>
        )}

        {view === 'original' &&
          (content ? (
            <SafeEmailFrame
              html={content.html || `<pre>${content.text}</pre>`}
              className="min-h-96"
            />
          ) : (
            <LoadingState label="Fetching from Gmail…" />
          ))}

        {view === 'trace' &&
          (trace ? <PipelineTrace trace={trace} /> : <LoadingState label="Loading trace…" />)}
      </div>

      <footer className="space-y-2 border-t border-line px-6 py-3">
        {notice && (
          <p role="status" className={`text-sm ${notice.ok ? 'text-safe' : 'text-danger'}`}>
            {notice.text}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={draftReply}
            disabled={busy !== null || dangerous || email.direction !== 'inbound'}
            title={dangerous ? 'Replies are never drafted for dangerous mail' : undefined}
          >
            <PencilSimpleLine aria-hidden="true" className="size-4" /> Draft reply
          </Button>
          {readerForm?.meeting_request && (
            <Button
              variant="secondary"
              onClick={proposeMeeting}
              disabled={busy !== null || dangerous}
            >
              <CalendarPlus aria-hidden="true" className="size-4" /> Propose meeting
            </Button>
          )}
          <Button variant="secondary" onClick={archive} disabled={busy !== null}>
            <Archive aria-hidden="true" className="size-4" /> Archive
          </Button>
          <Button variant="secondary" onClick={trust} disabled={busy !== null}>
            <UserCheck aria-hidden="true" className="size-4" />{' '}
            {sender.trusted ? 'Remove trust' : 'Mark trusted'}
          </Button>
          <Link
            to={`/chat?emailId=${gmailId}`}
            className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-surface-2"
          >
            <ChatCircle aria-hidden="true" className="size-4" /> Ask about this email
          </Link>
          {verdict && risky && (
            <Button variant="ghost" onClick={feedback} disabled={busy !== null}>
              {notPhishing ? 'Undo “not phishing”' : 'Report not phishing'}
            </Button>
          )}
        </div>
      </footer>
    </article>
  );
}

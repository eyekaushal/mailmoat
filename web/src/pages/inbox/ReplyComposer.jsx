import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { FormField, INPUT_CLASSES } from '../../components/FormField.jsx';
import { useApiClient } from '../../lib/useApi.js';
import { Dialog } from '../../ui/Dialog.jsx';

/**
 * The reply composer (PLAN §14.1 decision 4). Reply opens it; the user writes the text or asks
 * the Drafter for one, edits it, then saves it to Gmail Drafts or sends it for approval. Nothing
 * is sent from here: "Send for approval" creates a `send_email` approval that waits on the
 * Approvals page. The AI path on a SUSPICIOUS email asks once ("Draft anyway").
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void, gmailId: string,
 *   level: string | null, initial?: { text: string, draftId: string | null } | null,
 *   onDone: (notice: { ok: boolean, text: string }) => void }} props
 */
export function ReplyComposer({ open, onOpenChange, gmailId, level, initial = null, onDone }) {
  const client = useApiClient();
  const [mode, setMode] = useState(initial ? 'edit' : 'choose');
  const [instructions, setInstructions] = useState('');
  const [text, setText] = useState(initial?.text ?? '');
  // Where the words came from decides how the server tags them (PLAN §14.1 decision 6). A
  // continued Gmail draft is treated like an AI draft: it may have been written by one.
  const [origin, setOrigin] = useState(initial ? 'ai' : 'user');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const suspicious = level === 'SUSPICIOUS';
  const draftId = initial?.draftId ?? null;

  async function act(name, work) {
    setBusy(name);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(null);
    }
  }

  const draftWithAi = () =>
    act('draft', async () => {
      const result = await client.post(`/emails/${gmailId}/compose`, {
        instructions: instructions.trim() || null,
        allowSuspicious: suspicious,
      });
      setText(result.text);
      setOrigin('ai');
      setMode('edit');
    });

  const saveDraft = () =>
    act('save', async () => {
      await client.post(`/emails/${gmailId}/save-reply`, { body: text.trim(), origin, draftId });
      onOpenChange(false);
      onDone({ ok: true, text: 'Saved to Gmail Drafts. Nothing is sent until you approve it.' });
    });

  const requestSend = () =>
    act('send', async () => {
      await client.post(`/emails/${gmailId}/reply-request`, { body: text.trim(), origin, draftId });
      onOpenChange(false);
      onDone({
        ok: true,
        text: 'Sent for approval. Open Approvals and click Send to deliver it; nothing has left yet.',
      });
    });

  const title = mode === 'choose' ? 'Reply' : mode === 'ai' ? 'Draft with AI' : 'Your reply';
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={
        mode === 'choose'
          ? 'Write it yourself, or let the assistant draft it. Either way you read it before anything is sent.'
          : mode === 'ai'
            ? 'A quarantined writer drafts from this email and your note. It is a draft to edit, not a reply that goes out.'
            : 'Save it as a Gmail draft, or send it for approval. Mail leaves only from the Approvals page.'
      }
      actions={
        mode === 'choose' ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => setMode('ai')}>
              Draft with AI
            </Button>
            <Button onClick={() => setMode('edit')}>Write it myself</Button>
          </>
        ) : mode === 'ai' ? (
          <>
            <Button variant="ghost" onClick={() => setMode('choose')}>
              Back
            </Button>
            <Button onClick={draftWithAi} disabled={busy !== null}>
              {busy === 'draft' ? 'Drafting…' : suspicious ? 'Draft anyway' : 'Draft'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={saveDraft}
              disabled={!text.trim() || busy !== null}
            >
              {busy === 'save' ? 'Saving…' : 'Save to Drafts'}
            </Button>
            <Button onClick={requestSend} disabled={!text.trim() || busy !== null}>
              {busy === 'send' ? 'Requesting…' : 'Send for approval'}
            </Button>
          </>
        )
      }
    >
      {mode === 'ai' && (
        <div className="space-y-3">
          {suspicious && (
            <p className="text-sm text-secondary">
              This email was flagged as suspicious. Read the draft carefully before you keep it.
            </p>
          )}
          <FormField label="What should it say? (optional)">
            {(id) => (
              <input
                id={id}
                type="text"
                maxLength={2000}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="e.g. say we will pay on Friday"
                className={INPUT_CLASSES}
              />
            )}
          </FormField>
        </div>
      )}
      {mode === 'edit' && (
        <div className="space-y-2">
          <textarea
            aria-label="Reply text"
            rows={10}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Dear …"
            className={`${INPUT_CLASSES} resize-y`}
          />
          {origin === 'ai' && (
            <p className="text-sm text-secondary">
              Written from this email. It can only be sent back to this conversation.
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </Dialog>
  );
}

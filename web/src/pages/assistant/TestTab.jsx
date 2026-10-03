import { EyeOff, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { DisarmedLink } from '../../components/DisarmedLink.jsx';
import { INPUT_CLASSES } from '../../components/FormField.jsx';
import { PipelineTrace } from '../../components/PipelineTrace.jsx';
import { useApi, useApiClient } from '../../lib/useApi.js';

/**
 * PRD F4.3: paste an email (raw or plain text) or pick a recent one, and see exactly what the
 * live pipeline would do. Nothing runs: no labels, no drafts, no Gmail writes.
 */
export function TestTab() {
  const client = useApiClient();
  const { data: recent } = useApi('/emails?limit=20');
  const [raw, setRaw] = useState('');
  const [gmailId, setGmailId] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function test(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await client.post('/rules/test', gmailId ? { gmailId } : { raw }));
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={test} className="space-y-3">
        <label className="block text-sm font-medium">
          Pick a recent email
          <select
            value={gmailId}
            onChange={(e) => setGmailId(e.target.value)}
            className={`${INPUT_CLASSES} mt-1`}
          >
            <option value="">— or paste one below —</option>
            {(recent?.items ?? []).map((email) => (
              <option key={email.gmailId} value={email.gmailId}>
                {email.fromName || email.fromAddr} · {new Date(email.date).toLocaleDateString()} ·{' '}
                {(email.summary ?? '').slice(0, 60)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Paste an email (raw .eml with headers, or just the text)
          <textarea
            rows={8}
            value={raw}
            disabled={gmailId !== ''}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={'From: someone@example.com\nSubject: …\n\nBody…'}
            className={`${INPUT_CLASSES} mt-1 font-mono text-xs disabled:opacity-50`}
          />
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || (!gmailId && !raw.trim())}>
            <FlaskConical aria-hidden="true" className="size-4" />{' '}
            {busy ? 'Analysing…' : 'Run the pipeline'}
          </Button>
          <span className="text-xs text-muted">
            Side-effect free: nothing is labelled, drafted or sent.
          </span>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </form>

      {result && <TestResult result={result} />}
    </div>
  );
}

function TestResult({ result }) {
  const level = result.verdict?.level ?? null;
  const trace = {
    direction: 'inbound',
    auth: result.auth,
    signals: result.signals,
    reader: result.reader,
    verdict: result.verdict,
    rules: result.matches.map((match) => ({ ruleId: match.name, actionsTaken: match.actions })),
    events: [],
  };
  return (
    <section aria-label="Test result" className="space-y-4">
      {result.hidden.length > 0 && (
        <div className="rounded-lg border border-warn/40 bg-warn-soft/40 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <EyeOff aria-hidden="true" className="size-4 text-warn" /> Hidden content found (
            {result.hidden.length})
          </p>
          <ul className="mt-2 space-y-1">
            {result.hidden.map((item, index) => (
              <li key={index} className="flex gap-2">
                <span className="shrink-0 rounded bg-surface-2 px-1.5 font-mono text-[11px]">
                  {item.technique}
                </span>
                <span className="break-words whitespace-pre-wrap text-muted">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.links.length > 0 && (
        <div className="rounded-lg border border-line p-3 text-sm">
          <p className="font-medium">Links ({result.links.length})</p>
          <ul className="mt-2 space-y-1">
            {result.links.map((link, index) => (
              <li key={index}>
                <DisarmedLink href={link.href} text={link.text} level={level} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <PipelineTrace trace={trace} preview />
    </section>
  );
}

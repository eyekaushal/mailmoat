import { EyeSlash } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { DisarmedLink } from '../../components/DisarmedLink.jsx';
import { FormField, INPUT_CLASSES } from '../../components/FormField.jsx';
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
    <div className="space-y-5 px-5 py-4">
      <form onSubmit={test} className="max-w-2xl space-y-3">
        <FormField label="Pick a recent email">
          {(id) => (
            <select
              id={id}
              value={gmailId}
              onChange={(e) => setGmailId(e.target.value)}
              className={INPUT_CLASSES}
            >
              <option value="">Or paste one below</option>
              {(recent?.items ?? []).map((email) => (
                <option key={email.gmailId} value={email.gmailId}>
                  {email.fromName || email.fromAddr} · {email.subject || '(no subject)'}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Paste an email (raw .eml with headers, or just the text)">
          {(id) => (
            <textarea
              id={id}
              rows={8}
              value={raw}
              disabled={gmailId !== ''}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={'From: someone@example.com\nSubject: …\n\nBody…'}
              className={`${INPUT_CLASSES} font-mono text-sm disabled:opacity-45`}
            />
          )}
        </FormField>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || (!gmailId && !raw.trim())}>
            {busy ? 'Analysing…' : 'Run the pipeline'}
          </Button>
          <span className="text-sm text-secondary">
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
    <section aria-label="Test result" className="max-w-3xl space-y-4">
      {result.hidden.length > 0 && (
        <div className="rounded-md bg-surface-2 px-4 py-3 text-base">
          <p className="flex items-center gap-2 font-medium">
            <EyeSlash aria-hidden="true" size={16} className="text-secondary" /> Hidden content
            found ({result.hidden.length})
          </p>
          <ul className="mt-2 space-y-1">
            {result.hidden.map((item, index) => (
              <li key={index} className="flex gap-2">
                <span className="shrink-0 rounded-[4px] bg-surface-3 px-1.5 text-xs text-secondary">
                  {item.technique}
                </span>
                <span className="break-words whitespace-pre-wrap text-secondary">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.links.length > 0 && (
        <div className="rounded-md bg-surface-2 px-4 py-3 text-base">
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

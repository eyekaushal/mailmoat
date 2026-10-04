import { Check, CheckCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/Button.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { useApi } from '../../lib/useApi.js';
import { AnthropicStep } from './AnthropicStep.jsx';
import { GoogleStep } from './GoogleStep.jsx';
import { RulesStep } from './RulesStep.jsx';

const STEPS = [
  { id: 'anthropic', title: 'Anthropic key' },
  { id: 'google', title: 'Connect Google' },
  { id: 'rules', title: 'Rules' },
];

/** Where to start: the first thing still missing, or where Google just sent us back to. */
function initialStep(view, googleResult) {
  if (googleResult?.status === 'error') return 1;
  if (!view.anthropic.configured) return 0;
  if (!view.google.connected) return 1;
  return 2;
}

/**
 * First-run setup (PRD F1, §8): three steps, then "Connected ✓ — first sync running". Also where
 * `/api/google/callback` lands (`?google=connected|error`).
 */
export function SetupWizard() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: view, mutate } = useApi('/settings');
  const googleResult = params.get('google')
    ? { status: params.get('google'), reason: params.get('reason') ?? undefined }
    : null;
  const [step, setStep] = useState(null);
  const [done, setDone] = useState(false);

  if (!view) return <LoadingState label="Checking your setup…" />;
  const current = step ?? initialStep(view, googleResult);

  function go(next) {
    if (googleResult) setParams({}, { replace: true });
    setStep(next);
  }

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col px-4 py-8 sm:px-8">
      <header className="mb-8 flex items-center gap-3">
        <img src="/brand/wordmark.svg" alt="mailmoat" className="h-9" />
        <div>
          <h1 className="text-lg font-medium tracking-tight">Set up mailmoat</h1>
          <p className="text-sm text-muted">Three steps. Nothing to install or edit by hand.</p>
        </div>
      </header>

      {done ? (
        <Finished />
      ) : (
        <div className="grid gap-8 md:grid-cols-[200px_1fr]">
          <ol className="flex gap-2 md:flex-col" aria-label="Setup steps">
            {STEPS.map((s, index) => {
              const complete =
                (index === 0 && view.anthropic.configured) ||
                (index === 1 && view.google.connected);
              const active = index === current;
              return (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                      complete
                        ? 'bg-safe text-white'
                        : active
                          ? 'bg-accent text-accent-fg'
                          : 'bg-surface-2 text-muted'
                    }`}
                    aria-hidden="true"
                  >
                    {complete ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className={active ? 'font-medium' : 'text-muted'}>
                    {s.title}
                    {active && <span className="sr-only"> (current step)</span>}
                  </span>
                </li>
              );
            })}
          </ol>

          <section className="rounded-xl border border-line bg-surface p-6 shadow-sm">
            {current === 0 && (
              <AnthropicStep
                anthropic={view.anthropic}
                onSaved={() => mutate()}
                onContinue={() => go(1)}
              />
            )}
            {current === 1 && (
              <GoogleStep google={view.google} result={googleResult} onContinue={() => go(2)} />
            )}
            {current === 2 && <RulesStep onFinish={() => setDone(true)} />}
          </section>
        </div>
      )}
      {done && (
        <div className="mt-6 flex justify-center">
          <Button onClick={() => navigate('/inbox', { replace: true })}>Open your inbox</Button>
        </div>
      )}
    </div>
  );
}

function Finished() {
  const { data: health } = useApi('/health', { refreshInterval: 5000 });
  const emails = health?.sync?.emails ?? 0;
  return (
    <section className="mx-auto max-w-md rounded-xl border border-safe/40 bg-safe-soft p-8 text-center">
      <CheckCircle aria-hidden="true" className="mx-auto size-10 text-safe" />
      <h2 className="mt-3 text-xl font-semibold">Connected ✓</h2>
      <p className="mt-1 text-sm text-muted">
        First sync running. mailmoat is fetching the last 30 days of mail and analysing new messages
        as they arrive.
      </p>
      <p className="mt-3 text-sm" role="status">
        {emails > 0 ? `${emails} emails synced so far` : 'Waiting for the first messages…'}
      </p>
    </section>
  );
}

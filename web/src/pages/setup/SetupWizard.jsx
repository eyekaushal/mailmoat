import { Check, CheckCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/Button.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { Wallpaper } from '../../components/Wallpaper.jsx';
import { useApi } from '../../lib/useApi.js';
import { Panel } from '../../ui/Panel.jsx';
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
 * First-run setup (PRD F1, §8) on the design system, lighter than the app (PLAN §13.8): wordmark
 * header, the step list on the left, one panel on the right, one primary button per step. Also
 * where `/api/google/callback` lands (`?google=connected|error`).
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

  function go(next) {
    if (googleResult) setParams({}, { replace: true });
    setStep(next);
  }

  const current = view ? (step ?? initialStep(view, googleResult)) : 0;

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col px-6 py-6">
      <Wallpaper />
      <header className="flex h-14 shrink-0 items-center gap-3">
        <img src="/brand/wordmark.svg" alt="mailmoat" className="h-7" />
        <span className="text-base text-secondary">Set up in three steps. Nothing to install.</span>
      </header>

      {!view ? (
        <LoadingState label="Checking your setup…" />
      ) : done ? (
        <Finished onOpen={() => navigate('/inbox', { replace: true })} />
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-[200px_1fr]">
          <ol className="flex gap-4 md:flex-col md:gap-1" aria-label="Setup steps">
            {STEPS.map((s, index) => {
              const complete =
                (index === 0 && view.anthropic.configured) ||
                (index === 1 && view.google.connected);
              const active = index === current;
              return (
                <li
                  key={s.id}
                  aria-current={active ? 'step' : undefined}
                  className={`flex h-9 items-center gap-2.5 rounded-md px-2 text-base ${
                    active ? 'bg-panel font-medium text-ink' : 'text-secondary'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                      complete
                        ? 'bg-safe-soft text-safe'
                        : active
                          ? 'bg-accent text-accent-fg'
                          : 'bg-surface-3 text-secondary'
                    }`}
                  >
                    {complete ? <Check size={12} weight="bold" /> : index + 1}
                  </span>
                  {s.title}
                  {active && <span className="sr-only"> (current step)</span>}
                </li>
              );
            })}
          </ol>

          <Panel className="p-6">
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
          </Panel>
        </div>
      )}
    </div>
  );
}

function Finished({ onOpen }) {
  const { data: health } = useApi('/health', { refreshInterval: 5000 });
  const emails = health?.sync?.emails ?? 0;
  return (
    <Panel className="mx-auto mt-10 w-full max-w-md p-8 text-center">
      <CheckCircle aria-hidden="true" size={32} className="mx-auto text-safe" />
      <h2 className="mt-3 text-xl font-medium tracking-tight">Connected ✓</h2>
      <p className="mt-1 text-base text-secondary">
        First sync running. mailmoat is fetching the last 30 days of mail and analysing new messages
        as they arrive.
      </p>
      <p className="mt-3 text-base" role="status">
        {emails > 0 ? `${emails} emails synced so far` : 'Waiting for the first messages…'}
      </p>
      <Button className="mt-5" onClick={onOpen}>
        Open your inbox
      </Button>
    </Panel>
  );
}

import { Check, ShieldWarning } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { useApiClient } from '../../lib/useApi.js';

/** What mailmoat asks Google for, in plain words (PRD F1.5). */
const PERMISSIONS = [
  ['Read, label and archive your Gmail', 'to analyse mail and apply the mailmoat labels'],
  [
    'Create drafts and send mail you approve',
    'replies are only ever drafted or sent after your click',
  ],
  ['Read free/busy and create calendar events', 'to propose meeting times you confirm'],
  ['See your email address', 'to show which account is connected'],
];

/** A numbered callout on a figure: the accent, never the risk red. */
function Callout({ n }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-3 -right-5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-accent-fg"
    >
      {n}
    </span>
  );
}

/** A drawn stand-in for a screenshot of Google's "unverified app" dialog, with where to click. */
function WarningFigure() {
  return (
    <figure className="rounded-md bg-surface-2 p-3 text-xs">
      <div className="mx-auto max-w-sm rounded-sm bg-white p-4 text-[#202124] shadow-[inset_0_0_0_1px_var(--line)]">
        <p className="text-md font-medium">Google hasn’t verified this app</p>
        <p className="mt-2 text-[#5f6368]">
          The app is requesting access to sensitive info in your Google Account. Until the developer
          verifies this app with Google, you shouldn’t use it.
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="relative font-medium text-[#5f6368] underline">
            Advanced
            <Callout n={1} />
          </span>
          <span className="rounded-sm bg-[#1a73e8] px-3 py-1.5 font-medium text-white">
            Back to safety
          </span>
        </div>
        <div className="mt-3 border-t border-[#dadce0] pt-3">
          <span className="relative font-medium text-[#5f6368] underline">
            Go to mailmoat (unsafe)
            <Callout n={2} />
          </span>
        </div>
      </div>
      <figcaption className="mt-2 text-secondary">
        <b className="font-medium text-ink">1</b> Click <i>Advanced</i> ·{' '}
        <b className="font-medium text-ink">2</b> click <i>Go to mailmoat (unsafe)</i> · then tick
        every permission and press Continue.
      </figcaption>
    </figure>
  );
}

/**
 * Wizard step 2 (PRD F1.4): the guided warning screen, then one button that sends the browser to
 * Google. Google returns to `/api/google/callback`, which lands back on `/?google=…`.
 * @param {{ google: { clientConfigured: boolean, connected: boolean, email: string | null },
 *   result?: { status: 'connected' | 'error', reason?: string } | null,
 *   onContinue: () => void, navigateTo?: (url: string) => void }} props
 */
export function GoogleStep({
  google,
  result = null,
  onContinue,
  navigateTo = (url) => window.location.assign(url),
}) {
  const client = useApiClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await client.get('/google/auth-url');
      navigateTo(url);
    } catch (caught) {
      setError(caught.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-medium tracking-tight">Connect Google</h2>
        <p className="mt-1 text-base text-secondary">
          Gmail and Calendar, through Google’s own sign-in. mailmoat keeps the access token
          encrypted on this Mac; you can disconnect at any time from Settings.
        </p>
      </header>

      {google.connected ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-2 px-4 py-3">
          <span className="size-2 rounded-full bg-safe" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-base">
            <p className="font-medium">Google connected</p>
            <p className="text-sm text-secondary">{google.email}</p>
          </div>
          <Button onClick={onContinue}>Continue</Button>
        </div>
      ) : (
        <>
          {result?.status === 'error' && (
            <p role="alert" className="text-sm text-danger">
              Google sign-in did not complete: {result.reason ?? 'unknown error'}. Try again below.
            </p>
          )}

          <section className="space-y-3 rounded-md bg-surface-2 px-4 py-3">
            <h3 className="flex items-center gap-2 text-base font-medium">
              <ShieldWarning aria-hidden="true" size={16} className="text-secondary" />
              Google will say “unverified app”. Here is why, and what to click.
            </h3>
            <p className="text-base text-secondary">
              Google only verifies apps that run on a company’s servers and pass a paid review.
              mailmoat is a small, free app that runs entirely on your Mac: your mail never passes
              through a mailmoat server, so there is nothing for Google to inspect. Google’s own
              rules allow personal-use apps like this one without verification, but the sign-in page
              still shows a warning.
            </p>
            <WarningFigure />
          </section>

          <section>
            <h3 className="text-base font-medium">What you will be asked to allow</h3>
            <ul className="mt-2 space-y-1 text-base">
              {PERMISSIONS.map(([what, why]) => (
                <li key={what} className="flex gap-2">
                  <Check aria-hidden="true" size={14} className="mt-0.5 shrink-0 text-secondary" />
                  <span>
                    <span className="font-medium">{what}</span>
                    <span className="text-secondary"> — {why}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-secondary">
              Please tick every permission; mailmoat refuses a partial grant and asks again.
            </p>
          </section>

          {!google.clientConfigured ? (
            <p role="alert" className="text-sm text-danger">
              This build has no Google OAuth client. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
              in .env and restart.
            </p>
          ) : (
            <div className="space-y-2">
              <Button onClick={connect} disabled={busy}>
                {busy ? 'Opening Google…' : 'Continue to Google'}
              </Button>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

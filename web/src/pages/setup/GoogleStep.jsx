import { CheckCircle, ShieldWarning, XCircle } from '@phosphor-icons/react';
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

/** A drawn stand-in for a screenshot of Google's "unverified app" dialog, with where to click. */
function WarningFigure() {
  return (
    <figure className="rounded-lg border border-line bg-surface-2 p-3 text-xs">
      <div className="mx-auto max-w-sm rounded-md border border-line bg-white p-4 text-[#202124] shadow-sm">
        <p className="text-base font-medium">Google hasn’t verified this app</p>
        <p className="mt-2 text-[#5f6368]">
          The app is requesting access to sensitive info in your Google Account. Until the developer
          verifies this app with Google, you shouldn’t use it.
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="relative font-medium text-[#5f6368] underline">
            Advanced
            <Callout n={1} />
          </span>
          <span className="rounded bg-[#1a73e8] px-3 py-1.5 font-medium text-white">
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
      <figcaption className="mt-2 text-muted">
        <b className="text-fg">1</b> Click <i>Advanced</i> · <b className="text-fg">2</b> click{' '}
        <i>Go to mailmoat (unsafe)</i> · then tick every permission and press Continue.
      </figcaption>
    </figure>
  );
}

function Callout({ n }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-3 -right-5 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white"
    >
      {n}
    </span>
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
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Connect Google</h2>
        <p className="mt-1 text-sm text-muted">
          Gmail and Calendar, through Google’s own sign-in. mailmoat keeps the access token
          encrypted on this Mac; you can disconnect at any time from Settings.
        </p>
      </header>

      {google.connected ? (
        <div className="flex items-center gap-3 rounded-lg border border-safe/40 bg-safe-soft p-4">
          <CheckCircle aria-hidden="true" className="size-5 text-safe" />
          <div className="flex-1 text-sm">
            <p className="font-medium">Google connected</p>
            <p className="text-muted">{google.email}</p>
          </div>
          <Button onClick={onContinue}>Continue</Button>
        </div>
      ) : (
        <>
          {result?.status === 'error' && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger"
            >
              <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                Google sign-in did not complete: {result.reason ?? 'unknown error'}. Try again
                below.
              </span>
            </p>
          )}

          <section className="space-y-3 rounded-lg border border-warn/40 bg-warn-soft/40 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldWarning aria-hidden="true" className="size-4 text-warn" />
              Google will say “unverified app”. Here is why, and what to click.
            </h3>
            <p className="text-sm text-muted">
              Google only verifies apps that run on a company’s servers and pass a paid review.
              mailmoat is a small, free app that runs entirely on your Mac: your mail never passes
              through a mailmoat server, so there is nothing for Google to inspect. Google’s own
              rules allow personal-use apps like this one without verification, but the sign-in page
              still shows a warning.
            </p>
            <WarningFigure />
          </section>

          <section>
            <h3 className="text-sm font-semibold">What you will be asked to allow</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {PERMISSIONS.map(([what, why]) => (
                <li key={what} className="flex gap-2">
                  <CheckCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-safe" />
                  <span>
                    <span className="font-medium">{what}</span>
                    <span className="text-muted"> — {why}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Please tick every permission; mailmoat refuses a partial grant and asks again.
            </p>
          </section>

          {!google.clientConfigured ? (
            <p
              role="alert"
              className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger"
            >
              This build has no Google OAuth client. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
              in .env and restart.
            </p>
          ) : (
            <div className="space-y-2">
              <Button onClick={connect} disabled={busy} className="w-full sm:w-auto">
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

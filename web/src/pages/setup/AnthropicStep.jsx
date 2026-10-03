import { CheckCircle2, KeyRound, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Button, ExternalButton } from '../../components/Button.jsx';
import { FormField, INPUT_CLASSES } from '../../components/FormField.jsx';
import { useApiClient } from '../../lib/useApi.js';

const CONSOLE = 'https://console.anthropic.com';
const KEYS_URL = `${CONSOLE}/settings/keys`;
const BILLING_URL = `${CONSOLE}/settings/billing`;

/** PRD §9: about $0.003 per email read; the Planner only runs on the user's requests. */
const COST_ROWS = [
  ['30 emails a day', '≈ $3 / month'],
  ['100 emails a day', '≈ $9 / month'],
  ['300 emails a day', '≈ $27 / month'],
];

/** A drawn stand-in for a screenshot of the Console's API keys page, with where to click. */
function ConsoleFigure() {
  return (
    <figure className="rounded-lg border border-line bg-surface-2 p-3 text-xs">
      <div className="rounded-md border border-line bg-surface shadow-sm">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-muted">
          <span className="size-2 rounded-full bg-line" />
          <span className="size-2 rounded-full bg-line" />
          <span className="size-2 rounded-full bg-line" />
          <span className="ml-2 font-mono">console.anthropic.com/settings/keys</span>
        </div>
        <div className="flex">
          <ul className="w-28 space-y-1 border-r border-line p-2 text-muted">
            <li>Dashboard</li>
            <li>Usage</li>
            <li className="rounded bg-accent-soft px-1 font-medium text-accent">API keys</li>
            <li>Billing</li>
          </ul>
          <div className="flex-1 p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-fg">API keys</span>
              <span className="relative rounded bg-accent px-2 py-1 font-medium text-accent-fg">
                + Create Key
                <Callout n={1} />
              </span>
            </div>
            <div className="mt-3 rounded border border-dashed border-line p-2 text-muted">
              Name it <span className="font-mono text-fg">mailmoat</span>, click Create, then
              <span className="relative ml-1 rounded bg-surface-2 px-1 font-mono text-fg">
                Copy
                <Callout n={2} />
              </span>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-muted">
        <b className="text-fg">1</b> Create Key · <b className="text-fg">2</b> Copy it once; the
        Console never shows it again.
      </figcaption>
    </figure>
  );
}

function Callout({ n }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white"
    >
      {n}
    </span>
  );
}

function NoAccountSteps() {
  return (
    <ol className="space-y-3">
      {[
        ['Sign up', 'Create a free Anthropic Console account.', CONSOLE],
        [
          'Add credits',
          'Prepay a small amount (for example $5). mailmoat only spends what you use.',
          BILLING_URL,
        ],
        [
          'Create a key',
          'On the API keys page click Create Key, name it mailmoat and copy it.',
          KEYS_URL,
        ],
      ].map(([title, text, href], index) => (
        <li key={title} className="flex items-start gap-3 rounded-lg border border-line p-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
            {index + 1}
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-sm text-muted">{text}</p>
          </div>
          <ExternalButton href={href} variant="secondary" className="shrink-0">
            Continue to Anthropic
          </ExternalButton>
        </li>
      ))}
    </ol>
  );
}

function CostEstimate() {
  return (
    <div className="rounded-lg bg-surface-2 p-3 text-sm">
      <p className="font-medium">What it costs</p>
      <p className="mt-1 text-muted">
        Every email is read once by a small model, about $0.003 each. Drafts and chat add a little
        on top. You pay Anthropic directly; mailmoat takes nothing.
      </p>
      <table className="mt-2 w-full text-left">
        <tbody>
          {COST_ROWS.map(([volume, cost]) => (
            <tr key={volume} className="border-t border-line">
              <td className="py-1 text-muted">{volume}</td>
              <td className="py-1 text-right font-medium">{cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Wizard step 1 (PRD F1.1, F1.2): two guided ways to get an Anthropic key, then paste, test and
 * save. The key is write-only: after saving only the masked form ever comes back.
 * @param {{ anthropic: { configured: boolean, masked: string | null, source: string | null },
 *   onSaved: () => void, onContinue: () => void }} props
 */
export function AnthropicStep({ anthropic, onSaved, onContinue }) {
  const client = useApiClient();
  const [hasAccount, setHasAccount] = useState(null);
  const [replacing, setReplacing] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const showForm = !anthropic.configured || replacing;

  async function runTest() {
    setBusy('test');
    setError(null);
    try {
      setTest(await client.post('/secrets/anthropic/test', { apiKey: apiKey.trim() }));
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy('save');
    setError(null);
    try {
      await client.put('/secrets/anthropic', { apiKey: apiKey.trim() });
      setApiKey('');
      setTest(null);
      setReplacing(false);
      onSaved();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Your Anthropic API key</h2>
        <p className="mt-1 text-sm text-muted">
          mailmoat reads your email with Claude using your own key, so your mail goes from your Mac
          to Anthropic and nowhere else. The key is stored encrypted on this Mac and never shown
          again.
        </p>
      </header>

      {!showForm && (
        <div className="flex items-center gap-3 rounded-lg border border-safe/40 bg-safe-soft p-4">
          <CheckCircle2 aria-hidden="true" className="size-5 text-safe" />
          <div className="flex-1 text-sm">
            <p className="font-medium">Key saved</p>
            <p className="font-mono text-muted">
              {anthropic.masked}
              {anthropic.source === 'env' && ' (from .env)'}
            </p>
          </div>
          <Button variant="secondary" onClick={() => setReplacing(true)}>
            Replace
          </Button>
          <Button onClick={onContinue}>Continue</Button>
        </div>
      )}

      {showForm && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Do you have an Anthropic account?</legend>
            <div className="flex gap-2">
              <Button
                variant={hasAccount === true ? 'primary' : 'secondary'}
                onClick={() => setHasAccount(true)}
                aria-pressed={hasAccount === true}
              >
                Yes, I have one
              </Button>
              <Button
                variant={hasAccount === false ? 'primary' : 'secondary'}
                onClick={() => setHasAccount(false)}
                aria-pressed={hasAccount === false}
              >
                No, not yet
              </Button>
            </div>
          </fieldset>

          {hasAccount === true && (
            <div className="space-y-3">
              <ConsoleFigure />
              <ExternalButton href={KEYS_URL}>Open the Console’s API keys page</ExternalButton>
            </div>
          )}
          {hasAccount === false && (
            <div className="space-y-3">
              <NoAccountSteps />
              <CostEstimate />
            </div>
          )}

          {hasAccount !== null && (
            <form
              className="space-y-3 rounded-lg border border-line p-4"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <FormField
                label="Paste your key"
                hint="Starts with sk-ant-. It is sent once to this Mac’s mailmoat server and stored encrypted."
                error={error}
              >
                {(id) => (
                  <div className="relative">
                    <KeyRound
                      aria-hidden="true"
                      className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted"
                    />
                    <input
                      id={id}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={apiKey}
                      onChange={(event) => {
                        setApiKey(event.target.value);
                        setTest(null);
                      }}
                      placeholder="sk-ant-…"
                      className={`${INPUT_CLASSES} pl-9 font-mono`}
                    />
                  </div>
                )}
              </FormField>
              {test && (
                <p
                  role="status"
                  className={`flex items-center gap-2 text-sm ${test.ok ? 'text-safe' : 'text-danger'}`}
                >
                  {test.ok ? (
                    <CheckCircle2 aria-hidden="true" className="size-4" />
                  ) : (
                    <XCircle aria-hidden="true" className="size-4" />
                  )}
                  {test.ok ? 'The key works.' : `The key did not work: ${test.reason}`}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={runTest}
                  disabled={!apiKey.trim() || busy !== null}
                >
                  {busy === 'test' ? 'Testing…' : 'Test key'}
                </Button>
                <Button type="submit" disabled={!apiKey.trim() || busy !== null}>
                  {busy === 'save' ? 'Saving…' : 'Save key'}
                </Button>
                {replacing && (
                  <Button variant="ghost" onClick={() => setReplacing(false)}>
                    Keep the current key
                  </Button>
                )}
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}

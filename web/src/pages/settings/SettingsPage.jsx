import { CheckCircle, Trash, XCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { FormField, INPUT_CLASSES } from '../../components/FormField.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { WALLPAPERS, wallpaperPreview } from '../../components/Wallpaper.jsx';
import { useApi, useApiClient } from '../../lib/useApi.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Section({ title, description, children }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Notice({ ok, children }) {
  const Icon = ok ? CheckCircle : XCircle;
  return (
    <p
      role="status"
      className={`flex items-center gap-2 text-sm ${ok ? 'text-safe' : 'text-danger'}`}
    >
      <Icon aria-hidden="true" className="size-4" />
      {children}
    </p>
  );
}

/** Key, Google and the user-editable settings (PRD F1.6, §8). Secrets stay write-only (F1.2). */
export function SettingsPage() {
  const client = useApiClient();
  const { data: view, mutate } = useApi('/settings');
  if (!view) return <LoadingState label="Loading settings…" />;
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-8">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <AnthropicSection anthropic={view.anthropic} client={client} onChange={mutate} />
      <GoogleSection google={view.google} client={client} onChange={mutate} />
      <WallpaperSection current={view.settings.wallpaper} client={client} onChange={mutate} />
      {/* Keyed on the saved values so the form resets whenever the server's copy changes. */}
      <PreferencesForm
        key={JSON.stringify(view.settings)}
        settings={view.settings}
        client={client}
        onSaved={mutate}
      />
      <DangerZone client={client} />
    </div>
  );
}

function AnthropicSection({ anthropic, client, onChange }) {
  const [apiKey, setApiKey] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  async function act(work) {
    setBusy(true);
    setNotice(null);
    try {
      await work();
    } catch (caught) {
      setNotice({ ok: false, text: caught.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Anthropic API key"
      description="Stored encrypted on this Mac. Only the masked form is ever shown."
    >
      <p className="text-sm">
        {anthropic.configured ? (
          <>
            Current key: <span className="font-mono">{anthropic.masked}</span>
            {anthropic.source === 'env' && <span className="text-muted"> (from .env)</span>}
          </>
        ) : (
          <span className="text-warn">No key saved. mailmoat cannot analyse mail without one.</span>
        )}
      </p>
      <FormField
        label={anthropic.configured ? 'Replace key' : 'API key'}
        hint="Starts with sk-ant-"
      >
        {(id) => (
          <input
            id={id}
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-ant-…"
            className={`${INPUT_CLASSES} font-mono`}
          />
        )}
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy || (!apiKey.trim() && !anthropic.configured)}
          onClick={() =>
            act(async () => {
              const body = apiKey.trim() ? { apiKey: apiKey.trim() } : {};
              const result = await client.post('/secrets/anthropic/test', body);
              setNotice({ ok: result.ok, text: result.ok ? 'The key works.' : result.reason });
            })
          }
        >
          Test {apiKey.trim() ? 'this key' : 'saved key'}
        </Button>
        <Button
          disabled={busy || !apiKey.trim()}
          onClick={() =>
            act(async () => {
              await client.put('/secrets/anthropic', { apiKey: apiKey.trim() });
              setApiKey('');
              setNotice({ ok: true, text: 'Key saved.' });
              await onChange();
            })
          }
        >
          Save key
        </Button>
        {anthropic.source === 'settings' && (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await client.delete('/secrets/anthropic');
                setNotice({ ok: true, text: 'Key removed.' });
                await onChange();
              })
            }
          >
            Remove key
          </Button>
        )}
      </div>
      {notice && <Notice ok={notice.ok}>{notice.text}</Notice>}
    </Section>
  );
}

function GoogleSection({ google, client, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await client.get('/google/auth-url');
      window.location.assign(url);
    } catch (caught) {
      setError(caught.message);
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Google? mailmoat stops syncing until you connect again.'))
      return;
    setBusy(true);
    setError(null);
    try {
      await client.post('/google/disconnect');
      await onChange();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Google" description="Gmail and Calendar access through Google sign-in.">
      {google.connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <Notice ok>Connected as {google.email}</Notice>
          <Button variant="danger" disabled={busy} onClick={disconnect} className="ml-auto">
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-warn">Not connected.</p>
          <Button disabled={busy || !google.clientConfigured} onClick={connect} className="ml-auto">
            Connect Google
          </Button>
        </div>
      )}
      {error && <Notice ok={false}>{error}</Notice>}
    </Section>
  );
}

/** The wallpaper behind the panels (DESIGN.md §7); saved as soon as a tile is picked. */
function WallpaperSection({ current, client, onChange }) {
  const [notice, setNotice] = useState(null);
  async function pick(wallpaper) {
    if (wallpaper === current) return;
    setNotice(null);
    try {
      await client.put('/settings', { wallpaper });
      await onChange();
    } catch (caught) {
      setNotice({ ok: false, text: caught.message });
    }
  }
  return (
    <Section
      title="Wallpaper"
      description="The painting behind the panels. Two Monets, a gradient, or none."
    >
      <div
        role="radiogroup"
        aria-label="Wallpaper"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {WALLPAPERS.map(({ id, label, hint }) => {
          const selected = id === current;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              title={hint}
              onClick={() => pick(id)}
              className={`group rounded-md p-1 text-left transition-colors duration-150 ease-out-soft ${
                selected ? 'bg-accent-soft' : 'hover:bg-surface-2'
              }`}
            >
              <span
                aria-hidden="true"
                style={wallpaperPreview(id)}
                className={`block aspect-[4/3] w-full rounded-sm bg-cover bg-center shadow-[inset_0_0_0_1px_var(--line)] ${
                  selected ? 'ring-2 ring-accent ring-offset-1' : ''
                }`}
              />
              <span
                className={`mt-1.5 block px-1 text-sm ${selected ? 'font-medium text-ink' : 'text-secondary'}`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
      {notice && <Notice ok={notice.ok}>{notice.text}</Notice>}
    </Section>
  );
}

/** Only the fields the user changed are sent (`PUT /settings` takes a partial). */
function changedFields(original, draft) {
  const patch = {};
  for (const key of Object.keys(draft)) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(original[key])) patch[key] = draft[key];
  }
  return patch;
}

function PreferencesForm({ settings, client, onSaved }) {
  const [draft, setDraft] = useState(settings);
  const [sender, setSender] = useState('');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const patch = changedFields(settings, draft);
  const dirty = Object.keys(patch).length > 0;
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const setHours = (key, value) => set('workingHours', { ...draft.workingHours, [key]: value });

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await client.put('/settings', patch);
      await onSaved();
      setNotice({ ok: true, text: 'Settings saved.' });
    } catch (caught) {
      setNotice({ ok: false, text: caught.message });
    } finally {
      setBusy(false);
    }
  }

  function addSender() {
    const address = sender.trim().toLowerCase();
    if (!address || draft.trustedSenders.includes(address)) return;
    set('trustedSenders', [...draft.trustedSenders, address]);
    setSender('');
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Section title="Models" description="Which Claude models do the thinking.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Planner"
            hint="Plans actions from your requests. Opus is the default; Sonnet is cheaper."
          >
            {(id) => (
              <select
                id={id}
                value={draft.plannerModel}
                onChange={(e) => set('plannerModel', e.target.value)}
                className={INPUT_CLASSES}
              >
                <option value="claude-opus-5-5">Claude Opus 5.5 (default)</option>
                <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (cheaper)</option>
              </select>
            )}
          </FormField>
          <FormField
            label="Drafter"
            hint="Writes formal replies. Haiku is the default; Sonnet writes better prose."
          >
            {(id) => (
              <select
                id={id}
                value={draft.drafterModel}
                onChange={(e) => set('drafterModel', e.target.value)}
                className={INPUT_CLASSES}
              >
                <option value="claude-haiku-4-5">Claude Haiku 4.5 (default)</option>
                <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (better prose)</option>
              </select>
            )}
          </FormField>
        </div>
        <p className="text-xs text-muted">
          Estimated cost: about $0.003 per email analysed, plus the drafts and chat you ask for. At
          100 emails a day that is roughly $9 a month, billed by Anthropic to your key.
        </p>
      </Section>

      <Section title="Sync and safety">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Check Gmail every (seconds)" hint="30 to 3600">
            {(id) => (
              <input
                id={id}
                type="number"
                min={30}
                max={3600}
                value={draft.pollIntervalSeconds}
                onChange={(e) => set('pollIntervalSeconds', Number(e.target.value))}
                className={INPUT_CLASSES}
              />
            )}
          </FormField>
          <label className="flex items-start gap-3 pt-6 text-sm">
            <input
              type="checkbox"
              checked={draft.autoArchiveDangerous}
              onChange={(e) => set('autoArchiveDangerous', e.target.checked)}
              className="mt-0.5 size-4 accent-accent"
            />
            <span>
              <span className="font-medium">Auto-archive dangerous mail</span>
              <span className="block text-muted">
                Dangerous emails leave the inbox but keep their label, so you can still find them.
              </span>
            </span>
          </label>
        </div>
      </Section>

      <Section
        title="Trusted senders"
        description="Addresses you vouch for. Trust never lowers a risk level below what the signals found; it only stops first-time-sender warnings."
      >
        <ul className="flex flex-wrap gap-2">
          {draft.trustedSenders.length === 0 && <li className="text-sm text-muted">None yet.</li>}
          {draft.trustedSenders.map((address) => (
            <li
              key={address}
              className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 font-mono text-xs"
            >
              {address}
              <button
                type="button"
                aria-label={`Remove ${address}`}
                onClick={() =>
                  set(
                    'trustedSenders',
                    draft.trustedSenders.filter((a) => a !== address),
                  )
                }
                className="text-muted hover:text-danger"
              >
                <XCircle aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            type="email"
            aria-label="Add trusted sender"
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSender();
              }
            }}
            placeholder="name@example.com"
            className={INPUT_CLASSES}
          />
          <Button variant="secondary" onClick={addSender} disabled={!sender.trim()}>
            Add
          </Button>
        </div>
      </Section>

      <Section title="Drafts and meetings">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Your name for sign-offs" hint="Ends every draft after “Best regards,”">
            {(id) => (
              <input
                id={id}
                type="text"
                maxLength={80}
                value={draft.userName}
                onChange={(e) => set('userName', e.target.value)}
                className={INPUT_CLASSES}
              />
            )}
          </FormField>
          <FormField label="Delete unsent drafts after (days)" hint="1 to 90">
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                max={90}
                value={draft.draftRetentionDays}
                onChange={(e) => set('draftRetentionDays', Number(e.target.value))}
                className={INPUT_CLASSES}
              />
            )}
          </FormField>
          <FormField label="Draft footer" hint="Optional line added under every draft">
            {(id) => (
              <input
                id={id}
                type="text"
                maxLength={500}
                value={draft.draftFooter}
                onChange={(e) => set('draftFooter', e.target.value)}
                className={INPUT_CLASSES}
              />
            )}
          </FormField>
          <FormField label="Default meeting length (minutes)" hint="15 to 240">
            {(id) => (
              <input
                id={id}
                type="number"
                min={15}
                max={240}
                step={15}
                value={draft.meetingDurationMinutes}
                onChange={(e) => set('meetingDurationMinutes', Number(e.target.value))}
                className={INPUT_CLASSES}
              />
            )}
          </FormField>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Working hours</legend>
          <div className="flex flex-wrap gap-1">
            {DAY_NAMES.map((name, day) => {
              const on = draft.workingHours.days.includes(day);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setHours(
                      'days',
                      on
                        ? draft.workingHours.days.filter((d) => d !== day)
                        : [...draft.workingHours.days, day].sort(),
                    )
                  }
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${on ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted'}`}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="time"
              aria-label="Start of working day"
              value={draft.workingHours.start}
              onChange={(e) => setHours('start', e.target.value)}
              className={`${INPUT_CLASSES} w-auto`}
            />
            <span className="text-muted">to</span>
            <input
              type="time"
              aria-label="End of working day"
              value={draft.workingHours.end}
              onChange={(e) => setHours('end', e.target.value)}
              className={`${INPUT_CLASSES} w-auto`}
            />
          </div>
        </fieldset>
      </Section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(settings)}>
            Discard
          </Button>
        )}
        {notice && <Notice ok={notice.ok}>{notice.text}</Notice>}
      </div>
    </form>
  );
}

function DangerZone({ client }) {
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState(null);

  async function erase() {
    setState('busy');
    try {
      await client.post('/data/delete-all', { confirm: 'DELETE' });
      setState('done');
    } catch (caught) {
      setState(caught.message);
    }
  }

  return (
    <Section
      title="Delete all local data"
      description="Removes the database, the encrypted secrets and the key file from this Mac, then stops mailmoat. Your Gmail is untouched."
    >
      {state === 'done' ? (
        <Notice ok>Everything was deleted and mailmoat has stopped. Close this tab.</Notice>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            aria-label="Type DELETE to confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type DELETE to confirm"
            className={`${INPUT_CLASSES} max-w-xs`}
          />
          <Button
            variant="danger"
            disabled={confirm !== 'DELETE' || state === 'busy'}
            onClick={erase}
          >
            <Trash aria-hidden="true" className="size-4" /> Delete everything
          </Button>
          {state && state !== 'busy' && <Notice ok={false}>{state}</Notice>}
        </div>
      )}
    </Section>
  );
}

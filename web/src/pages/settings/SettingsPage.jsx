import {
  CaretDown,
  CaretRight,
  CheckCircle,
  DownloadSimple,
  X,
  XCircle,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Button, buttonClasses } from '../../components/Button.jsx';
import { FormField, INPUT_CLASSES } from '../../components/FormField.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { WALLPAPERS, wallpaperPreview } from '../../components/Wallpaper.jsx';
import { useApi, useApiClient } from '../../lib/useApi.js';
import { Dialog } from '../../ui/Dialog.jsx';
import { IconButton } from '../../ui/IconButton.jsx';
import { Switch } from '../../ui/Switch.jsx';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** One grouped section on the panel: a heading, one line of context, then the controls. */
function Section({ title, description, children, danger = false }) {
  return (
    <section className="border-t border-line py-5 first:border-t-0 first:pt-2">
      <h2 className={`text-md font-medium ${danger ? 'text-danger' : ''}`}>{title}</h2>
      {description && <p className="mt-0.5 text-base text-secondary">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Notice({ ok, children }) {
  const Icon = ok ? CheckCircle : XCircle;
  return (
    <p
      role="status"
      className={`flex items-center gap-1.5 text-sm ${ok ? 'text-safe' : 'text-danger'}`}
    >
      <Icon aria-hidden="true" size={14} />
      {children}
    </p>
  );
}

/**
 * PRD F1.6, §8 on the design system (PLAN §13.8): grouped sections, the wallpaper picker, and an
 * Advanced fold with the audit export and the delete-all zone. Secrets stay write-only (F1.2).
 */
export function SettingsPage() {
  const client = useApiClient();
  const { data: view, mutate } = useApi('/settings');
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center px-5">
        <h1 className="text-xl font-medium tracking-tight">Settings</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        {!view ? (
          <LoadingState label="Loading settings…" />
        ) : (
          <div className="max-w-2xl px-5 py-3">
            {/* Keyed on the saved values so the form resets whenever the server's copy changes. */}
            <PreferencesForm
              key={JSON.stringify(view.settings)}
              settings={view.settings}
              client={client}
              onSaved={mutate}
            />
            <ConnectionsSection view={view} client={client} onChange={mutate} />
            <WallpaperSection current={view.settings.wallpaper} client={client} onChange={mutate} />
            <Advanced client={client} />
          </div>
        )}
      </div>
    </div>
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
    <form onSubmit={save}>
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
        <p className="text-sm text-secondary">
          About $0.003 per email analysed, plus the drafts and chat you ask for. At 100 emails a day
          that is roughly $9 a month, billed by Anthropic to your key.
        </p>
      </Section>

      <Section
        title="Sync"
        description="How often mailmoat checks Gmail and how long it keeps drafts."
      >
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
        </div>
      </Section>

      <Section title="Security">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-medium">Auto-archive dangerous mail</p>
            <p className="text-base text-secondary">
              Dangerous emails leave the inbox but keep their label, so you can still find them.
            </p>
          </div>
          <Switch
            aria-label="Auto-archive dangerous mail"
            checked={draft.autoArchiveDangerous}
            onCheckedChange={(on) => set('autoArchiveDangerous', on)}
          />
        </div>
      </Section>

      <Section
        title="Working hours"
        description="When meetings may be proposed, and how long they are by default."
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Days</legend>
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
                  className={`h-7 rounded-md px-2.5 text-sm transition-colors duration-150 ease-out-soft ${
                    on
                      ? 'bg-accent-soft font-medium text-accent'
                      : 'bg-surface-2 text-secondary hover:text-ink'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2 text-base">
            <input
              type="time"
              aria-label="Start of working day"
              value={draft.workingHours.start}
              onChange={(e) => setHours('start', e.target.value)}
              className={`${INPUT_CLASSES} w-auto`}
            />
            <span className="text-secondary">to</span>
            <input
              type="time"
              aria-label="End of working day"
              value={draft.workingHours.end}
              onChange={(e) => setHours('end', e.target.value)}
              className={`${INPUT_CLASSES} w-auto`}
            />
          </div>
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
                className={`${INPUT_CLASSES} w-28`}
              />
            )}
          </FormField>
        </div>
      </Section>

      <Section title="Drafts" description="How every draft reply is signed.">
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
        </div>
      </Section>

      <Section
        title="Trusted senders"
        description="Addresses you vouch for. Trust never lowers a risk level below what the signals found; it only stops first-time-sender warnings."
      >
        <ul className="flex flex-wrap gap-1.5">
          {draft.trustedSenders.length === 0 && (
            <li className="text-base text-secondary">None yet.</li>
          )}
          {draft.trustedSenders.map((address) => (
            <li
              key={address}
              className="inline-flex h-6 items-center gap-0.5 rounded-sm bg-surface-2 pl-2 text-sm"
            >
              {address}
              <IconButton
                label={`Remove ${address}`}
                icon={X}
                size={12}
                className="size-5"
                onClick={() =>
                  set(
                    'trustedSenders',
                    draft.trustedSenders.filter((a) => a !== address),
                  )
                }
              />
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
            className={`${INPUT_CLASSES} max-w-xs`}
          />
          <Button variant="secondary" onClick={addSender} disabled={!sender.trim()}>
            Add
          </Button>
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-5 flex items-center gap-3 border-t border-line bg-panel-solid px-5 py-3">
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

/** The Anthropic key and the Google account, side by side under one heading. */
function ConnectionsSection({ view, client, onChange }) {
  return (
    <Section
      title="Connections"
      description="Your Anthropic key and Google account. Both stay encrypted on this Mac."
    >
      <AnthropicKey anthropic={view.anthropic} client={client} onChange={onChange} />
      <GoogleAccount google={view.google} client={client} onChange={onChange} />
    </Section>
  );
}

function AnthropicKey({ anthropic, client, onChange }) {
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
    <div className="rounded-md bg-surface-2 p-4">
      <p className="flex flex-wrap items-center gap-x-2 text-base">
        <span className="font-medium">Anthropic API key</span>
        {anthropic.configured ? (
          <>
            <span className="font-mono text-sm text-secondary">{anthropic.masked}</span>
            {anthropic.source === 'env' && (
              <span className="text-sm text-secondary">from .env</span>
            )}
          </>
        ) : (
          <span className="text-secondary">
            No key saved. mailmoat cannot analyse mail without one.
          </span>
        )}
      </p>
      <div className="mt-3">
        <FormField
          label={anthropic.configured ? 'Replace key' : 'API key'}
          hint="Starts with sk-ant-. Only the masked form is ever shown again."
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
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
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
          variant="secondary"
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
            variant="ghost"
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
        {notice && <Notice ok={notice.ok}>{notice.text}</Notice>}
      </div>
    </div>
  );
}

function GoogleAccount({ google, client, onChange }) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
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
    setAsking(false);
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
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-2 p-4 text-base">
      <span className="font-medium">Google</span>
      {google.connected ? (
        <Notice ok>Connected as {google.email}</Notice>
      ) : (
        <span className="text-secondary">Not connected.</span>
      )}
      <span className="flex-1" />
      {google.connected ? (
        <Button variant="ghost" disabled={busy} onClick={() => setAsking(true)}>
          Disconnect
        </Button>
      ) : (
        <Button variant="secondary" disabled={busy || !google.clientConfigured} onClick={connect}>
          Connect Google
        </Button>
      )}
      {error && <Notice ok={false}>{error}</Notice>}
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title="Disconnect Google?"
        description="mailmoat stops syncing until you connect again. Your mail and labels stay in Gmail."
        actions={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button onClick={disconnect}>Disconnect</Button>
          </>
        }
      />
    </div>
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
      <div role="radiogroup" aria-label="Wallpaper" className="grid grid-cols-4 gap-2">
        {WALLPAPERS.map(({ id, label, hint }) => {
          const selected = id === current;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              onClick={() => pick(id)}
              className={`group rounded-md p-1.5 text-left transition-colors duration-150 ease-out-soft ${
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
                className={`mt-1.5 block px-0.5 text-sm ${selected ? 'font-medium text-ink' : 'text-ink'}`}
              >
                {label}
              </span>
              <span className="block px-0.5 text-xs text-tertiary">{hint}</span>
            </button>
          );
        })}
      </div>
      {notice && <Notice ok={notice.ok}>{notice.text}</Notice>}
    </Section>
  );
}

/** Folded away: the audit export (decision 5) and the delete-all zone. */
function Advanced({ client }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-t border-line py-5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-md font-medium hover:text-accent"
      >
        {open ? (
          <CaretDown aria-hidden="true" size={14} />
        ) : (
          <CaretRight aria-hidden="true" size={14} />
        )}
        Advanced
      </button>
      {open && (
        <div className="mt-4 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Audit log</p>
              <p className="text-base text-secondary">
                Every plan, policy decision, approval and action, as JSON. The dashboard no longer
                shows it; the export is for the attack lab and for your own records.
              </p>
            </div>
            <a href="/api/audit/export" download className={buttonClasses('secondary')}>
              <DownloadSimple aria-hidden="true" size={16} /> Export JSON
            </a>
          </div>
          <DeleteAll client={client} />
        </div>
      )}
    </section>
  );
}

function DeleteAll({ client }) {
  const [asking, setAsking] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState(null);

  async function erase() {
    setAsking(false);
    setState('busy');
    try {
      await client.post('/data/delete-all', { confirm: 'DELETE' });
      setState('done');
    } catch (caught) {
      setState(caught.message);
    }
  }

  if (state === 'done')
    return <Notice ok>Everything was deleted and mailmoat has stopped. Close this tab.</Notice>;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-danger">Delete all local data</p>
        <p className="text-base text-secondary">
          Removes the database, the encrypted secrets and the key file from this Mac, then stops
          mailmoat. Your Gmail is untouched.
        </p>
        {state && state !== 'busy' && <Notice ok={false}>{state}</Notice>}
      </div>
      <Button variant="danger" disabled={state === 'busy'} onClick={() => setAsking(true)}>
        Delete everything…
      </Button>
      <Dialog
        open={asking}
        onOpenChange={(isOpen) => {
          setAsking(isOpen);
          if (!isOpen) setConfirm('');
        }}
        title="Delete all local data?"
        description="This cannot be undone. mailmoat stops afterwards and you start again from setup."
        actions={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={confirm !== 'DELETE'} onClick={erase}>
              Delete everything
            </Button>
          </>
        }
      >
        <input
          type="text"
          aria-label="Type DELETE to confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Type DELETE to confirm"
          autoComplete="off"
          className={INPUT_CLASSES}
        />
      </Dialog>
    </div>
  );
}

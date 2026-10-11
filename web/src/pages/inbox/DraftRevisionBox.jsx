import { ArrowUp, X } from '@phosphor-icons/react';
import { DRAFT_SKILLS, DRAFT_TONES } from '@mailmoat/shared/constants/drafts';
import { useRef, useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { useApiClient } from '../../lib/useApi.js';
import { Dialog } from '../../ui/Dialog.jsx';
import { Tooltip } from '../../ui/Tooltip.jsx';

/** What the menu says for each skill; the ids are the server's closed list (PLAN §16.2 decision 5). */
const HINTS = {
  rewrite: 'Change it the way you say',
  humanize: 'Sound like you wrote it',
  tone: 'Formal, semi-formal or casual',
  shorter: 'About half the length',
  longer: 'Expand with what the email asked for',
  proofread: 'Grammar and spelling only',
  complete: 'Answer every question in the email',
};

/**
 * The skills menu. Each entry is a fixed task the server knows by id; the words here are only
 * what the menu shows. Nothing is fetched and nothing runs locally.
 */
export const SKILLS = DRAFT_SKILLS.map((id) => ({
  id,
  hint: HINTS[id],
  needsWords: id === 'rewrite',
  needsTone: id === 'tone',
}));

export const TONES = DRAFT_TONES;

const PLACEHOLDER = 'Change this draft… type / for skills';

/** The menu entries that match what was typed after the slash; the tones once /tone is picked. */
function options(value, skill, tone) {
  if (skill?.needsTone && tone === null) return TONES.map((id) => ({ id, hint: null }));
  if (!value.startsWith('/')) return [];
  const prefix = value.slice(1).toLowerCase();
  return SKILLS.filter((entry) => entry.id.startsWith(prefix));
}

/**
 * The conversation box under a "Draft, not sent" block (PLAN §16.2 decision 4): one line and a
 * `/` menu of skills, like a chat assistant's slash commands. Enter asks the server to revise
 * the draft as shown; the result replaces the Gmail draft. Nothing is sent from here. On a
 * SUSPICIOUS email the first use asks once, as the composer does.
 * @param {{ gmailId: string, draft: { draftId: string, text: string }, level: string | null,
 *   onRevised: (result: { draftId: string }) => Promise<void> | void }} props
 */
export function DraftRevisionBox({ gmailId, draft, level, onRevised }) {
  const client = useApiClient();
  const input = useRef(null);
  const [value, setValue] = useState('');
  const [skill, setSkill] = useState(null);
  const [tone, setTone] = useState(null);
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(false);
  const suspicious = level === 'SUSPICIOUS';

  const menu = options(value, skill, tone);
  const menuOpen = menu.length > 0;
  const words = value.trim();
  const chosen = skill ?? (words && !value.startsWith('/') ? SKILLS[0] : null);
  const canSend =
    chosen !== null &&
    !busy &&
    !menuOpen &&
    (!chosen.needsWords || words !== '') &&
    (!chosen.needsTone || tone !== null);

  function pick(option) {
    if (skill?.needsTone) {
      setTone(option.id);
    } else {
      setSkill(option);
    }
    setValue('');
    setHighlight(0);
    input.current?.focus();
  }

  function clearChip() {
    if (tone !== null) setTone(null);
    else setSkill(null);
    input.current?.focus();
  }

  function onKeyDown(event) {
    if (menuOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setHighlight((index) => (index + step + menu.length) % menu.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(menu[Math.min(highlight, menu.length - 1)]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setValue('');
        return;
      }
    }
    if (event.key === 'Backspace' && value === '' && (skill || tone)) {
      event.preventDefault();
      clearChip();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  }

  function submit(allowSuspicious = false) {
    if (!canSend) return;
    if (suspicious && !allowSuspicious) {
      setAsking(true);
      return;
    }
    setBusy(true);
    setError(null);
    client
      .post(`/emails/${gmailId}/revise`, {
        draftId: draft.draftId,
        text: draft.text,
        skill: chosen.id,
        instruction: words || null,
        tone: chosen.needsTone ? tone : null,
        allowSuspicious,
      })
      .then(async (result) => {
        setValue('');
        setSkill(null);
        setTone(null);
        await onRevised(result);
      })
      .catch((caught) => setError(caught.message))
      .finally(() => setBusy(false));
  }

  const chip = skill ? `/${skill.id}${tone ? ` ${tone}` : ''}` : null;
  return (
    <div className="relative mt-3">
      {menuOpen && (
        <ul
          role="listbox"
          aria-label={skill?.needsTone ? 'Tones' : 'Skills'}
          className="pop absolute bottom-full left-0 z-30 mb-1.5 w-64 p-1.5"
        >
          {menu.map((option, index) => (
            <li
              key={option.id}
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(option);
              }}
              onMouseEnter={() => setHighlight(index)}
              className={`flex cursor-default items-baseline gap-2 rounded-md px-2.5 py-1.5 ${index === highlight ? 'bg-surface-2' : ''}`}
            >
              <span className="font-medium">{skill?.needsTone ? option.id : `/${option.id}`}</span>
              {option.hint && (
                <span className="truncate text-sm text-secondary">{option.hint}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1.5 rounded-xl border border-line-strong bg-panel-solid py-1 pr-1.5 pl-3 shadow-[inset_3px_0_0_var(--ask-b)] focus-within:border-accent">
        {chip && (
          <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md bg-accent-soft px-2 text-sm font-medium text-accent">
            {chip}
            <button
              type="button"
              aria-label="Remove skill"
              onClick={clearChip}
              className="rounded-sm hover:bg-surface-2"
            >
              <X size={12} />
            </button>
          </span>
        )}
        <input
          ref={input}
          type="text"
          aria-label="Change this draft"
          aria-expanded={menuOpen}
          aria-autocomplete="list"
          value={value}
          maxLength={1000}
          disabled={busy}
          onChange={(event) => {
            setValue(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={
            skill?.needsTone && tone === null
              ? 'Pick a tone'
              : skill
                ? 'Anything to add? Enter to run'
                : PLACEHOLDER
          }
          className="h-7 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-tertiary"
        />
        <Tooltip label="Revise" keys={['↵']}>
          <button
            type="button"
            aria-label="Revise"
            disabled={!canSend}
            onClick={() => submit()}
            className="ask-arrow flex size-7 shrink-0 items-center justify-center rounded-full transition-opacity duration-150 ease-out-soft disabled:opacity-35"
          >
            <ArrowUp size={14} weight="bold" />
          </button>
        </Tooltip>
      </div>
      {busy && <p className="ask-progress mt-1.5 text-sm text-accent">Revising…</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-secondary">
          {error}
        </p>
      )}
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title="Revise a draft to a suspicious email?"
        description="This email was flagged. The writer sees it again to revise your draft; read the result carefully before you keep it."
        actions={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setAsking(false);
                submit(true);
              }}
            >
              Revise anyway
            </Button>
          </>
        }
      />
    </div>
  );
}

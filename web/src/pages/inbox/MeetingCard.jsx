import { CalendarPlus, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button.jsx';
import { FormField, INPUT_CLASSES } from '../../components/FormField.jsx';
import { useApiClient } from '../../lib/useApi.js';

function slotLabel({ start, end }, timeZone) {
  const s = new Date(start);
  const e = new Date(end);
  const day = s.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  });
  const time = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone });
  return `${day}, ${time(s)} – ${time(e)}`;
}

/**
 * The meeting proposal (PRD F7.2/F7.5): Edit / Save. Values left as proposed keep their email
 * provenance; anything edited becomes the user's own, and the Policy Engine decides on Save.
 * @param {{ proposal: { gmailId: string, timeZone: string, title: string, description: string,
 *   attendees: string[], proposed: { start: string, end: string, free: boolean }[],
 *   chosen: { start: string, end: string } | null, alternatives: { start: string, end: string }[] },
 *   onSaved: (result: { eventId: string, link: string }) => void, onCancel: () => void }} props
 */
export function MeetingCard({ proposal, onSaved, onCancel }) {
  const client = useApiClient();
  const slots = [
    ...proposal.proposed.map((slot) => ({ ...slot, kind: 'proposed' })),
    ...proposal.alternatives.map((slot) => ({ ...slot, free: true, kind: 'alternative' })),
  ];
  const [title, setTitle] = useState(proposal.title);
  const [description, setDescription] = useState(proposal.description);
  const [attendees, setAttendees] = useState(proposal.attendees);
  const [newAttendee, setNewAttendee] = useState('');
  const [slot, setSlot] = useState(proposal.chosen ?? slots.find((s) => s.free) ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await client.post(`/emails/${proposal.gmailId}/save-meeting`, {
        title: title.trim(),
        description: description.trim(),
        start: slot.start,
        end: slot.end,
        attendees,
      });
      onSaved(result);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  function addAttendee() {
    const address = newAttendee.trim().toLowerCase();
    if (address && !attendees.includes(address)) setAttendees([...attendees, address]);
    setNewAttendee('');
  }

  return (
    <section
      aria-label="Meeting proposal"
      className="space-y-3 rounded-lg border border-line bg-surface p-4"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarPlus aria-hidden="true" className="size-4 text-accent" /> Meeting proposal
      </h3>
      {proposal.chosen === null && proposal.proposed.length > 0 && (
        <p className="text-sm text-warn">
          None of the proposed times is free. Here are the next free slots in your working hours.
        </p>
      )}
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted">
          Time ({proposal.timeZone})
        </legend>
        {slots.map((s) => (
          <label
            key={s.start}
            className={`flex items-center gap-2 text-sm ${s.free ? '' : 'text-muted'}`}
          >
            <input
              type="radio"
              name="slot"
              disabled={!s.free}
              checked={slot?.start === s.start}
              onChange={() => setSlot(s)}
              className="accent-accent"
            />
            {slotLabel(s, proposal.timeZone)}
            <span className="text-xs text-muted">
              {s.kind === 'proposed'
                ? s.free
                  ? 'proposed, free'
                  : 'proposed, busy'
                : 'next free slot'}
            </span>
          </label>
        ))}
        {slots.length === 0 && <p className="text-sm text-muted">No time to offer.</p>}
      </fieldset>
      <FormField label="Title">
        {(id) => (
          <input
            id={id}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={INPUT_CLASSES}
          />
        )}
      </FormField>
      <FormField label="Description">
        {(id) => (
          <textarea
            id={id}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={INPUT_CLASSES}
          />
        )}
      </FormField>
      <div className="space-y-1">
        <p className="text-sm font-medium">Attendees</p>
        <ul className="flex flex-wrap gap-1.5">
          {attendees.map((address) => (
            <li
              key={address}
              className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 font-mono text-xs"
            >
              {address}
              <button
                type="button"
                aria-label={`Remove ${address}`}
                onClick={() => setAttendees(attendees.filter((a) => a !== address))}
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
            aria-label="Add attendee"
            value={newAttendee}
            onChange={(e) => setNewAttendee(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addAttendee();
              }
            }}
            placeholder="name@example.com"
            className={INPUT_CLASSES}
          />
          <Button variant="secondary" onClick={addAttendee} disabled={!newAttendee.trim()}>
            Add
          </Button>
        </div>
        <p className="text-xs text-muted">
          Only people from this email or addresses you type can be invited.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !slot || !title.trim()}>
          {busy ? 'Saving…' : 'Save to Calendar'}
        </Button>
      </div>
    </section>
  );
}

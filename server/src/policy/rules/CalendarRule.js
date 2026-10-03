import { PolicyRule } from './PolicyRule.js';

/**
 * Events always need approval. Attendees may come from the user, or be participants of the
 * source email (the people already in the conversation); an injected "also invite eve@…" is
 * neither. The exfiltration guard covers the title and description.
 */
export class CalendarRule extends PolicyRule {
  constructor() {
    super(['create_calendar_event']);
  }

  decide(call, context) {
    const level = this.worstLevel(call, context);
    if (level === 'DANGEROUS') return this.deny('The source email is DANGEROUS; no event');
    const attendees = call.args.attendees;
    if (attendees && !attendees.sources.every((s) => s.type === 'user' || s.type === 'contacts')) {
      const allowed = new Set(call.emailIds.flatMap((id) => context.participants[id] ?? []));
      const stranger = attendees.value.find((a) => !allowed.has(String(a).toLowerCase()));
      if (stranger || call.emailIds.length === 0) {
        return this.deny('An attendee is neither from you nor a participant of the source email');
      }
    }
    const recipients = this.addressesIn(call, ['attendees']);
    const leaked = this.contentNotReadableBy(call, ['title', 'description'], recipients);
    if (leaked) return this.deny(`The ${leaked} contains data not every attendee may see`);
    return this.ask(
      level === 'SUSPICIOUS'
        ? 'The event comes from a SUSPICIOUS email: check it before approving'
        : 'Creating an event sends invitations; needs your approval',
    );
  }
}

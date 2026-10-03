import { z } from 'zod';
import { ToolError } from '../../core/errors.js';
import { TaggedValue } from '../TaggedValue.js';
import { Tool } from './Tool.js';

const MAX_ATTENDEES = 20;

/** Creates a calendar event and sends invitations. Always an approval (ASK) in policy. */
export class CreateCalendarEventTool extends Tool {
  #calendar;

  /** @param {{ calendar: Pick<import('../../google/CalendarClient.js').CalendarClient, 'createEvent'> }} deps */
  constructor({ calendar }) {
    super({
      name: 'create_calendar_event',
      description: 'Create a calendar event with invitations, after the user approves it.',
      args: z.strictObject({
        title: z.string().trim().min(1).max(200).describe('Event title.'),
        start: z.iso.datetime({ offset: true }).describe('Start, ISO 8601 with offset.'),
        end: z.iso.datetime({ offset: true }).describe('End, ISO 8601 with offset.'),
        attendees: z
          .array(z.email())
          .max(MAX_ATTENDEES)
          .optional()
          .describe("Attendee addresses: the user's, or the participants of the source email."),
        description: z.string().trim().max(2_000).optional().describe('Optional description.'),
      }),
    });
    this.#calendar = calendar;
  }

  async execute(args, { timeZone }) {
    const start = new Date(args.start.value);
    const end = new Date(args.end.value);
    if (end <= start) throw new ToolError('Event must end after it starts');
    const event = await this.#calendar.createEvent({
      summary: args.title.value,
      description: args.description?.value,
      start,
      end,
      attendees: args.attendees?.value ?? [],
      timeZone,
    });
    return TaggedValue.fromOwnData({ eventId: event.id, link: event.htmlLink }, 'calendar');
  }
}

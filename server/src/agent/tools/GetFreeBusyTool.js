import { z } from 'zod';
import { ToolError } from '../../core/errors.js';
import { TaggedValue } from '../TaggedValue.js';
import { Tool } from './Tool.js';

const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;

/** Busy intervals on the user's calendar: the user's own data. */
export class GetFreeBusyTool extends Tool {
  #calendar;

  /** @param {{ calendar: Pick<import('../../google/CalendarClient.js').CalendarClient, 'freeBusy'> }} deps */
  constructor({ calendar }) {
    super({
      name: 'get_free_busy',
      description:
        "List the busy intervals on the user's calendar between two times (at most 31 days).",
      args: z.strictObject({
        start: z.iso.datetime({ offset: true }).describe('Range start, ISO 8601 with offset.'),
        end: z.iso.datetime({ offset: true }).describe('Range end, ISO 8601 with offset.'),
      }),
    });
    this.#calendar = calendar;
  }

  async execute(args) {
    const timeMin = new Date(args.start.value);
    const timeMax = new Date(args.end.value);
    if (timeMax <= timeMin || timeMax - timeMin > MAX_RANGE_MS) {
      throw new ToolError('Free/busy range must be positive and at most 31 days');
    }
    const busy = await this.#calendar.freeBusy({ timeMin, timeMax });
    return TaggedValue.fromOwnData(
      {
        busy: busy.map((slot) => ({
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
        })),
      },
      'calendar',
    );
  }
}

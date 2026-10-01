import { describe, expect, it, vi } from 'vitest';
import { CalendarClient } from '../../../src/google/CalendarClient.js';

const googleAuth = { getAuthClient: () => 'auth-client' };

describe('CalendarClient', () => {
  it('returns busy intervals of the primary calendar as Dates', async () => {
    const query = vi.fn(async () => ({
      data: {
        calendars: {
          primary: { busy: [{ start: '2026-10-02T09:00:00Z', end: '2026-10-02T10:00:00Z' }] },
        },
      },
    }));
    const client = new CalendarClient(googleAuth, { createApi: () => ({ freebusy: { query } }) });
    const busy = await client.freeBusy({
      timeMin: new Date('2026-10-02T00:00:00Z'),
      timeMax: new Date('2026-10-03T00:00:00Z'),
    });
    expect(busy).toEqual([
      { start: new Date('2026-10-02T09:00:00Z'), end: new Date('2026-10-02T10:00:00Z') },
    ]);
    expect(query.mock.calls[0][0].requestBody.items).toEqual([{ id: 'primary' }]);
  });

  it('creates an event on the primary calendar and sends invitations', async () => {
    const insert = vi.fn(async () => ({ data: { id: 'e1', htmlLink: 'https://cal/e1' } }));
    const client = new CalendarClient(googleAuth, { createApi: () => ({ events: { insert } }) });
    const result = await client.createEvent({
      summary: 'Launch strategy chat',
      start: new Date('2026-10-02T11:00:00Z'),
      end: new Date('2026-10-02T11:30:00Z'),
      attendees: ['mia@example.com'],
      timeZone: 'Asia/Kolkata',
    });
    expect(result).toEqual({ id: 'e1', htmlLink: 'https://cal/e1' });
    expect(insert.mock.calls[0][0]).toMatchObject({
      calendarId: 'primary',
      sendUpdates: 'all',
      requestBody: {
        summary: 'Launch strategy chat',
        attendees: [{ email: 'mia@example.com' }],
        start: { dateTime: '2026-10-02T11:00:00.000Z', timeZone: 'Asia/Kolkata' },
      },
    });
  });
});

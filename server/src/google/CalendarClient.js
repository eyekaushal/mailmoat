import { calendar } from '@googleapis/calendar';

/**
 * The two Calendar operations mailmoat needs: read busy times and create an event.
 */
export class CalendarClient {
  #googleAuth;
  #createApi;
  #api;

  /**
   * @param {{ getAuthClient(): object }} googleAuth
   * @param {{ createApi?: (auth: object) => object }} [options] injectable for tests
   */
  constructor(googleAuth, { createApi = (auth) => calendar({ version: 'v3', auth }) } = {}) {
    this.#googleAuth = googleAuth;
    this.#createApi = createApi;
  }

  /**
   * Busy intervals on the user's primary calendar.
   * @param {{ timeMin: Date, timeMax: Date }} range
   * @returns {Promise<{ start: Date, end: Date }[]>}
   */
  async freeBusy({ timeMin, timeMax }) {
    const { data } = await this.#calendar().freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: 'primary' }],
      },
    });
    return (data.calendars?.primary?.busy ?? []).map((slot) => ({
      start: new Date(slot.start),
      end: new Date(slot.end),
    }));
  }

  /**
   * Creates an event and emails invitations. Only the ActionExecutor may call this,
   * after the Policy Engine allowed it and the user approved.
   * @param {{ summary: string, description?: string, start: Date, end: Date, attendees?: string[], timeZone: string }} event
   * @returns {Promise<{ id: string, htmlLink: string }>}
   */
  async createEvent({ summary, description, start, end, attendees = [], timeZone }) {
    const { data } = await this.#calendar().events.insert({
      calendarId: 'primary',
      sendUpdates: 'all',
      requestBody: {
        summary,
        description,
        start: { dateTime: start.toISOString(), timeZone },
        end: { dateTime: end.toISOString(), timeZone },
        attendees: attendees.map((email) => ({ email })),
      },
    });
    return { id: data.id, htmlLink: data.htmlLink };
  }

  #calendar() {
    this.#api ??= this.#createApi(this.#googleAuth.getAuthClient());
    return this.#api;
  }
}

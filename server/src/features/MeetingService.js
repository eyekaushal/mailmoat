import { EmailFacts } from '../agent/EmailFacts.js';
import { TaggedValue } from '../agent/TaggedValue.js';
import { MeetingError } from '../core/errors.js';
import { WorkingHours } from './WorkingHours.js';

const DEFAULT_DURATION_MINUTES = 30;
const ALTERNATIVES = 3;
const MINUTE_MS = 60 * 1000;

/**
 * @typedef {{ start: string, end: string }} Slot ISO 8601 with offset
 * @typedef {{
 *   gmailId: string, level: string, timeZone: string, durationMinutes: number,
 *   title: string, description: string, attendees: string[],
 *   proposed: (Slot & { free: boolean })[], chosen: Slot | null, alternatives: Slot[],
 * }} Proposal
 */

/**
 * Meeting proposals from emails (PRD F7). `propose` turns the Reader's typed `proposed_times`
 * into a conflict-checked card from the user's free/busy data; nothing is created. `save` is
 * the card's Save button: it files the event as a `create_calendar_event` approval and approves
 * it in the user's name, so the Policy Engine (attendees, risk, exfiltration) has the final say.
 */
export class MeetingService {
  #deps;

  /**
   * @param {object} deps
   * @param {Pick<import('../google/CalendarClient.js').CalendarClient, 'freeBusy'>} deps.calendar
   * @param {Pick<import('../db/repositories/EmailRepository.js').EmailRepository, 'get'>} deps.emails
   * @param {Pick<import('../db/repositories/VerdictRepository.js').VerdictRepository, 'get'|'readerForm'>} deps.verdicts
   * @param {Pick<import('../actions/ApprovalService.js').ApprovalService, 'request'|'approve'>} deps.approvals
   * @param {Pick<import('../db/repositories/SettingsRepository.js').SettingsRepository, 'get'>} deps.settings
   * @param {Pick<import('../audit/AuditLog.js').AuditLog, 'record'>} deps.auditLog
   * @param {() => string | null} deps.userEmail the connected Google address
   * @param {string} deps.timeZone
   * @param {() => Date} [deps.now]
   */
  constructor(deps) {
    this.#deps = { now: () => new Date(), ...deps };
  }

  /**
   * @param {{ gmailId: string, allowRisky?: boolean }} input `allowRisky` only on the user's explicit request (F7.4)
   * @returns {Promise<Proposal>}
   * @throws {MeetingError}
   */
  async propose({ gmailId, allowRisky = false }) {
    const { emails, verdicts, settings, auditLog, now } = this.#deps;
    const record = emails.get(gmailId);
    if (!record) throw new MeetingError('Email not found');
    const level = this.#level(record);
    if (level === 'DANGEROUS')
      throw new MeetingError('No meeting is proposed for a DANGEROUS email');
    if (level === 'SUSPICIOUS' && !allowRisky) {
      throw new MeetingError('A SUSPICIOUS email is only scheduled when you ask for it');
    }
    const times = verdicts.readerForm(gmailId)?.meeting_request?.proposed_times ?? [];
    if (times.length === 0) throw new MeetingError('The email proposes no meeting times');

    const hours = this.#hours();
    const durationMinutes = settings.get('meetingDurationMinutes', DEFAULT_DURATION_MINUTES);
    const current = now();
    const candidates = times
      .map((iso) => hours.resolve(iso))
      .filter((start) => start >= current)
      .map((start) => ({ start, end: new Date(start.getTime() + durationMinutes * MINUTE_MS) }));
    const busy = await this.#busyAround(candidates);
    const proposed = candidates.map(({ start, end }) => ({
      ...MeetingService.#slot(start, end),
      free: !WorkingHours.isBusy(start, end, busy),
    }));
    const chosen = proposed.find((slot) => slot.free) ?? null;
    const alternatives = chosen
      ? []
      : (await this.freeSlots({ from: current, durationMinutes, count: ALTERNATIVES })).map(
          ({ start, end }) => MeetingService.#slot(start, end),
        );

    auditLog.record({
      actor: 'system',
      event: 'meeting_proposed',
      subject: gmailId,
      decision: level,
      data: {
        proposed: proposed.length,
        free: proposed.filter((s) => s.free).length,
        alternatives: alternatives.length,
      },
    });
    return {
      gmailId,
      level,
      timeZone: hours.timeZone,
      durationMinutes,
      ...this.#defaults(record),
      proposed: proposed.map((slot) => ({ ...slot })),
      chosen: chosen && { start: chosen.start, end: chosen.end },
      alternatives,
    };
  }

  /**
   * Free slots in working hours from `from` on (F7.5; also used by chat).
   * @param {{ from: Date, durationMinutes?: number, count?: number }} query
   * @returns {Promise<{ start: Date, end: Date }[]>}
   */
  async freeSlots({ from, durationMinutes = DEFAULT_DURATION_MINUTES, count = ALTERNATIVES }) {
    const hours = this.#hours();
    const horizonDays = 14;
    const busy = await this.#deps.calendar.freeBusy({
      timeMin: from,
      timeMax: new Date(from.getTime() + horizonDays * 24 * 60 * MINUTE_MS),
    });
    return hours.nextSlots({ from, durationMinutes, busy, count, horizonDays });
  }

  /**
   * The card's Save: creates the event through an approval the user grants by saving.
   * Values equal to what `propose` produced keep their email provenance; anything the user
   * changed is their own data, exactly as an edited approval would be.
   * @param {{ gmailId: string, title: string, description?: string, start: string, end: string, attendees: string[] }} card
   * @param {{ via?: string }} [options]
   * @returns {Promise<{ approvalId: string, eventId: string, link: string }>}
   * @throws {MeetingError} when the Policy Engine denies the event
   */
  async save({ gmailId, title, description, start, end, attendees }, { via = 'dashboard' } = {}) {
    const { emails, approvals } = this.#deps;
    const record = emails.get(gmailId);
    if (!record) throw new MeetingError('Email not found');
    const hours = this.#hours();
    const defaults = this.#defaults(record);
    const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    const ownOrEdited = (value, original) =>
      value === original ? EmailFacts.tag(value, record) : TaggedValue.fromUser(value);

    const args = {
      title: ownOrEdited(title, defaults.title),
      start: TaggedValue.fromUser(hours.resolve(start).toISOString()),
      end: TaggedValue.fromUser(hours.resolve(end).toISOString()),
      attendees: sameList(attendees, defaults.attendees)
        ? EmailFacts.tag([...attendees], record)
        : TaggedValue.fromUser([...attendees]),
    };
    if (description) args.description = ownOrEdited(description, defaults.description);

    const call = { step: 0, tool: 'create_calendar_event', args, emailIds: [gmailId] };
    const { id } = await approvals.request({ call, reason: 'Saved from the meeting card' });
    const outcome = await approvals.approve(id, { via, timeZone: hours.timeZone });
    if (outcome.status !== 'performed') throw new MeetingError(outcome.reason);
    return {
      approvalId: id,
      eventId: outcome.result.value.eventId,
      link: outcome.result.value.link,
    };
  }

  /** The user's own sent mail carries no verdict and is not treated as risky. */
  #level(record) {
    if (record.direction === 'outbound') return 'SAFE';
    return this.#deps.verdicts.get(record.gmailId)?.level ?? 'SUSPICIOUS';
  }

  #hours() {
    return WorkingHours.fromSettings(this.#deps.settings, this.#deps.timeZone);
  }

  /** Title, description and attendees as the card first shows them (email-derived). */
  #defaults(record) {
    const me = this.#deps.userEmail()?.toLowerCase() ?? null;
    const other =
      record.direction === 'inbound' ? record.fromAddr : (record.toAddrs[0] ?? record.fromAddr);
    const who = record.direction === 'inbound' && record.fromName ? record.fromName : other;
    return {
      title: `Meeting with ${who}`,
      description: `Proposed in an email from ${record.fromAddr} on ${record.date.slice(0, 10)}.`,
      attendees: EmailFacts.participants(record).filter((address) => address !== me),
    };
  }

  async #busyAround(candidates) {
    if (candidates.length === 0) return [];
    const timeMin = new Date(Math.min(...candidates.map((c) => c.start.getTime())));
    const timeMax = new Date(Math.max(...candidates.map((c) => c.end.getTime())));
    return this.#deps.calendar.freeBusy({ timeMin, timeMax });
  }

  static #slot(start, end) {
    return { start: start.toISOString(), end: end.toISOString() };
  }
}

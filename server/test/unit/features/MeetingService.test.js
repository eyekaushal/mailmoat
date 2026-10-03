import { beforeEach, describe, expect, it } from 'vitest';
import { ActionExecutor } from '../../../src/actions/ActionExecutor.js';
import { ApprovalService } from '../../../src/actions/ApprovalService.js';
import { CreateCalendarEventTool } from '../../../src/agent/tools/CreateCalendarEventTool.js';
import { ToolRegistry } from '../../../src/agent/tools/ToolRegistry.js';
import { MeetingError } from '../../../src/core/errors.js';
import { Logger } from '../../../src/core/Logger.js';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { ApprovalRepository } from '../../../src/db/repositories/ApprovalRepository.js';
import { EmailRepository } from '../../../src/db/repositories/EmailRepository.js';
import { SettingsRepository } from '../../../src/db/repositories/SettingsRepository.js';
import { VerdictRepository } from '../../../src/db/repositories/VerdictRepository.js';
import { MeetingService } from '../../../src/features/MeetingService.js';
import { PolicyEngine } from '../../../src/policy/PolicyEngine.js';
import { CalendarRule } from '../../../src/policy/rules/CalendarRule.js';
import { Verdict } from '../../../src/security/risk/Verdict.js';
import { VALID_FORM } from '../../../../shared/test/schemas/fixtures.js';

// Thursday 8 Oct 2026, 15:30 IST.
const NOW = new Date('2026-10-08T10:00:00Z');
const FRIDAY_5PM = '2026-10-09T11:30:00.000Z';
const ME = 'kaushal@gmail.com';

let db;
let emails;
let verdicts;
let settings;
let calendar;
let audit;
let busy;

function store(
  gmailId,
  { direction = 'inbound', level = 'SAFE', times = ['2026-10-09T17:00'] } = {},
) {
  const record = {
    gmailId,
    threadId: `t-${gmailId}`,
    direction,
    fromAddr: direction === 'inbound' ? 'rahul@acme-corp.com' : ME,
    fromDomain: direction === 'inbound' ? 'acme-corp.com' : 'gmail.com',
    fromName: direction === 'inbound' ? 'Rahul Mehta' : null,
    toAddrs: direction === 'inbound' ? [ME, 'priya@acme-corp.com'] : ['rahul@acme-corp.com'],
    recipientNames: {},
    date: '2026-10-08T09:00:00.000Z',
    subjectHash: null,
    hasListUnsubscribe: false,
    unsubscribeUrl: null,
    oneClick: false,
    labels: [],
    isRead: false,
  };
  emails.insertIfAbsent(record, { pending: false });
  verdicts.save({
    gmailId,
    at: NOW,
    bodyHash: 'h',
    auth: { trusted: true, spf: { result: 'pass' }, dkim: [], dmarc: { result: 'pass' } },
    signals: [],
    readerForm: { ...VALID_FORM, meeting_request: times ? { proposed_times: times } : null },
    readerModel: 'm',
    verdict:
      level &&
      new Verdict({
        level,
        score: 0,
        reasons: [],
        floor: level,
        floorReasons: [],
        injectionAttempt: false,
        verifyByPhone: false,
      }),
  });
  return record;
}

function service() {
  const logger = new Logger({ level: 'error', sink: () => {} });
  const auditLog = { record: (entry) => audit.push(entry) };
  const registry = new ToolRegistry([new CreateCalendarEventTool({ calendar })]);
  const approvals = new ApprovalService({
    approvals: new ApprovalRepository(db),
    registry,
    policy: new PolicyEngine({ rules: [new CalendarRule()], emails, verdicts, logger }),
    executor: new ActionExecutor({ registry, auditLog }),
    auditLog,
    now: () => NOW,
  });
  return new MeetingService({
    calendar,
    emails,
    verdicts,
    approvals,
    settings,
    auditLog,
    userEmail: () => ME,
    timeZone: 'Asia/Kolkata',
    now: () => NOW,
  });
}

beforeEach(() => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
  emails = new EmailRepository(db);
  verdicts = new VerdictRepository(db);
  settings = new SettingsRepository(db);
  audit = [];
  busy = [];
  calendar = {
    calls: [],
    async freeBusy(range) {
      calendar.calls.push(['freeBusy', range]);
      return busy;
    },
    async createEvent(event) {
      calendar.calls.push(['createEvent', event]);
      return { id: 'evt-1', htmlLink: 'https://calendar.google.com/evt-1' };
    },
  };
});

describe('MeetingService.propose', () => {
  it('turns "Friday at 5" into a conflict-checked card for the email’s participants', async () => {
    store('m1');
    const proposal = await service().propose({ gmailId: 'm1' });
    expect(proposal).toEqual({
      gmailId: 'm1',
      level: 'SAFE',
      timeZone: 'Asia/Kolkata',
      durationMinutes: 30,
      title: 'Meeting with Rahul Mehta',
      description: 'Proposed in an email from rahul@acme-corp.com on 2026-10-08.',
      attendees: ['rahul@acme-corp.com', 'priya@acme-corp.com'],
      proposed: [{ start: FRIDAY_5PM, end: '2026-10-09T12:00:00.000Z', free: true }],
      chosen: { start: FRIDAY_5PM, end: '2026-10-09T12:00:00.000Z' },
      alternatives: [],
    });
    expect(calendar.calls).toEqual([
      [
        'freeBusy',
        { timeMin: new Date(FRIDAY_5PM), timeMax: new Date('2026-10-09T12:00:00.000Z') },
      ],
    ]);
    expect(audit).toEqual([
      expect.objectContaining({
        event: 'meeting_proposed',
        subject: 'm1',
        decision: 'SAFE',
        data: { proposed: 1, free: 1, alternatives: 0 },
      }),
    ]);
    expect(JSON.stringify(audit)).not.toContain('Rahul');
  });

  it('picks the first free proposed time and honours the duration setting', async () => {
    store('m1', { times: ['2026-10-09T17:00', '2026-10-12T10:00:00+05:30', '2026-10-01T10:00'] });
    settings.set('meetingDurationMinutes', 60);
    busy = [{ start: new Date('2026-10-09T11:00:00Z'), end: new Date('2026-10-09T11:45:00Z') }];
    const proposal = await service().propose({ gmailId: 'm1' });
    expect(proposal.proposed).toEqual([
      { start: FRIDAY_5PM, end: '2026-10-09T12:30:00.000Z', free: false },
      { start: '2026-10-12T04:30:00.000Z', end: '2026-10-12T05:30:00.000Z', free: true },
    ]);
    expect(proposal.chosen).toEqual({
      start: '2026-10-12T04:30:00.000Z',
      end: '2026-10-12T05:30:00.000Z',
    });
    expect(proposal.alternatives).toEqual([]);
  });

  it('offers the next three free working-hour slots when every proposed time is taken (F7.5)', async () => {
    store('m1');
    busy = [{ start: new Date('2026-10-09T11:00:00Z'), end: new Date('2026-10-09T13:00:00Z') }];
    const proposal = await service().propose({ gmailId: 'm1' });
    expect(proposal.chosen).toBeNull();
    expect(proposal.proposed[0].free).toBe(false);
    // From Thu 15:30 IST: 15:30, 16:00, 16:30 the same afternoon.
    expect(proposal.alternatives).toEqual([
      { start: '2026-10-08T10:00:00.000Z', end: '2026-10-08T10:30:00.000Z' },
      { start: '2026-10-08T10:30:00.000Z', end: '2026-10-08T11:00:00.000Z' },
      { start: '2026-10-08T11:00:00.000Z', end: '2026-10-08T11:30:00.000Z' },
    ]);
    expect(calendar.calls.map(([name]) => name)).toEqual(['freeBusy', 'freeBusy']);
  });

  it('refuses DANGEROUS mail, SUSPICIOUS mail unless asked, unknown mail and mail without times', async () => {
    store('bad', { level: 'DANGEROUS' });
    store('odd', { level: 'SUSPICIOUS' });
    store('unknown', { level: null });
    store('none', { times: null });
    const s = service();
    await expect(s.propose({ gmailId: 'bad' })).rejects.toThrow(/DANGEROUS/);
    await expect(s.propose({ gmailId: 'bad', allowRisky: true })).rejects.toThrow(MeetingError);
    await expect(s.propose({ gmailId: 'odd' })).rejects.toThrow(/SUSPICIOUS/);
    await expect(s.propose({ gmailId: 'unknown' })).rejects.toThrow(/SUSPICIOUS/);
    await expect(s.propose({ gmailId: 'nope' })).rejects.toThrow(/not found/);
    await expect(s.propose({ gmailId: 'none' })).rejects.toThrow(/no meeting times/);
    expect(calendar.calls).toEqual([]);
    expect((await s.propose({ gmailId: 'odd', allowRisky: true })).level).toBe('SUSPICIOUS');
  });

  it('treats the user’s own sent mail as safe and invites the people they wrote to', async () => {
    store('sent', { direction: 'outbound', level: null });
    const proposal = await service().propose({ gmailId: 'sent' });
    expect(proposal).toMatchObject({
      level: 'SAFE',
      title: 'Meeting with rahul@acme-corp.com',
      attendees: ['rahul@acme-corp.com'],
    });
  });
});

describe('MeetingService.save', () => {
  it('creates the event through an approval the user grants by saving', async () => {
    store('m1');
    const s = service();
    const proposal = await s.propose({ gmailId: 'm1' });
    const result = await s.save({ ...proposal, ...proposal.chosen });

    expect(result).toEqual({
      approvalId: expect.any(String),
      eventId: 'evt-1',
      link: 'https://calendar.google.com/evt-1',
    });
    expect(calendar.calls.at(-1)).toEqual([
      'createEvent',
      {
        summary: 'Meeting with Rahul Mehta',
        description: 'Proposed in an email from rahul@acme-corp.com on 2026-10-08.',
        start: new Date(FRIDAY_5PM),
        end: new Date('2026-10-09T12:00:00.000Z'),
        attendees: ['rahul@acme-corp.com', 'priya@acme-corp.com'],
        timeZone: 'Asia/Kolkata',
      },
    ]);
    const events = audit.map((a) => a.event);
    expect(events).toEqual([
      'meeting_proposed',
      'approval_requested',
      'action_performed',
      'approval_decided',
    ]);
    expect(audit[1].data.sources).toEqual([{ type: 'email', id: 'm1' }, { type: 'user' }]);
    expect(audit[3]).toMatchObject({
      actor: 'user',
      decision: 'APPROVED',
      data: { via: 'dashboard' },
    });
    expect(new ApprovalRepository(db).get(result.approvalId)).toMatchObject({ status: 'APPROVED' });
  });

  it('treats edited fields as the user’s own data, including an added attendee', async () => {
    store('m1');
    const s = service();
    const result = await s.save(
      {
        gmailId: 'm1',
        title: 'Roadmap sync',
        description: 'Agenda to follow',
        start: '2026-10-09T17:00',
        end: '2026-10-09T18:00',
        attendees: ['rahul@acme-corp.com', 'cto@example.com'],
      },
      { via: 'chat' },
    );
    expect(result.eventId).toBe('evt-1');
    expect(calendar.calls.at(-1)[1]).toMatchObject({
      summary: 'Roadmap sync',
      attendees: ['rahul@acme-corp.com', 'cto@example.com'],
      start: new Date(FRIDAY_5PM),
      end: new Date('2026-10-09T12:30:00.000Z'),
    });
    const requested = audit.find((a) => a.event === 'approval_requested');
    expect(requested.data.sources).toEqual([{ type: 'user' }]);
    expect(audit.at(-1).data.via).toBe('chat');
  });

  it('lets the Policy Engine deny: a DANGEROUS source creates nothing', async () => {
    store('bad', { level: 'DANGEROUS' });
    const s = service();
    await expect(
      s.save({
        gmailId: 'bad',
        title: 'Pay me',
        start: '2026-10-09T17:00',
        end: '2026-10-09T17:30',
        attendees: ['rahul@acme-corp.com'],
      }),
    ).rejects.toThrow(/DANGEROUS/);
    expect(calendar.calls).toEqual([]);
    expect(audit.at(-1)).toMatchObject({ event: 'approval_decided', decision: 'REJECTED' });
    await expect(
      s.save({
        gmailId: 'nope',
        title: 't',
        start: '2026-10-09T17:00',
        end: '2026-10-09T17:30',
        attendees: [],
      }),
    ).rejects.toThrow(/not found/);
  });
});

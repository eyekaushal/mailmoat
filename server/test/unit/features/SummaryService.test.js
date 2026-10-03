import { beforeEach, describe, expect, it } from 'vitest';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { EmailRepository } from '../../../src/db/repositories/EmailRepository.js';
import { RuleRepository } from '../../../src/db/repositories/RuleRepository.js';
import { VerdictRepository } from '../../../src/db/repositories/VerdictRepository.js';
import { SummaryService } from '../../../src/features/SummaryService.js';
import { PredefinedRules } from '../../../src/rules/PredefinedRules.js';
import { Verdict } from '../../../src/security/risk/Verdict.js';
import { VALID_FORM } from '../../../../shared/test/schemas/fixtures.js';

// 8 Oct 2026 15:30 IST; the day started at 2026-10-07T18:30:00Z.
const NOW = new Date('2026-10-08T10:00:00Z');

let db;
let emails;
let verdicts;
let rules;

function store(
  gmailId,
  { date, direction = 'inbound', level = 'SAFE', injection = false, form = {}, runs = [] },
) {
  emails.insertIfAbsent(
    {
      gmailId,
      threadId: `t-${gmailId}`,
      direction,
      fromAddr: 'rahul@acme-corp.com',
      fromDomain: 'acme-corp.com',
      fromName: null,
      toAddrs: [],
      recipientNames: {},
      date,
      subjectHash: null,
      hasListUnsubscribe: false,
      unsubscribeUrl: null,
      oneClick: false,
      labels: [],
      isRead: false,
    },
    { pending: false },
  );
  verdicts.save({
    gmailId,
    at: NOW,
    bodyHash: 'h',
    auth: { trusted: true, spf: { result: 'pass' }, dkim: [], dmarc: { result: 'pass' } },
    signals: [],
    readerForm:
      form === null ? null : { ...VALID_FORM, meeting_request: null, needs_reply: false, ...form },
    readerModel: 'm',
    verdict:
      level &&
      new Verdict({
        level,
        score: 0,
        reasons: [],
        floor: level,
        floorReasons: [],
        injectionAttempt: injection,
        verifyByPhone: false,
      }),
  });
  for (const ruleId of runs)
    rules.recordRun({ gmailId, ruleId, actionsTaken: ['label'], status: 'done', at: NOW });
}

beforeEach(() => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
  emails = new EmailRepository(db);
  verdicts = new VerdictRepository(db);
  rules = new RuleRepository(db);
  rules.seed(
    new PredefinedRules().list().map((r) => ({
      id: r.id,
      name: r.name,
      actions: r.defaultActions,
      isSecurity: r.isSecurity,
    })),
  );
});

describe('SummaryService.today', () => {
  it('counts today’s inbound mail by rule, replies, meetings and threats, with untrusted highlights', () => {
    store('a', {
      date: '2026-10-07T19:00:00.000Z',
      form: { needs_reply: true, summary: 'Rahul asks for the deck.' },
      runs: ['to_reply'],
    });
    store('b', {
      date: '2026-10-08T03:00:00.000Z',
      form: { category: 'newsletter', summary: 'Deals.' },
      runs: ['newsletter'],
    });
    store('c', {
      date: '2026-10-08T04:00:00.000Z',
      form: {
        meeting_request: { proposed_times: ['2026-10-09T17:00'] },
        needs_reply: true,
        summary: 'Meet Friday?',
      },
      runs: ['to_reply'],
    });
    store('d', {
      date: '2026-10-08T05:00:00.000Z',
      level: 'DANGEROUS',
      injection: true,
      form: null,
      runs: ['dangerous', 'injection_attempt'],
    });
    store('e', {
      date: '2026-10-08T06:00:00.000Z',
      level: 'SUSPICIOUS',
      form: { needs_reply: true, summary: 'Pay now.' },
      runs: ['suspicious'],
    });
    store('yesterday', {
      date: '2026-10-07T18:00:00.000Z',
      form: { needs_reply: true },
      runs: ['to_reply'],
    });
    store('sent', {
      date: '2026-10-08T07:00:00.000Z',
      direction: 'outbound',
      level: null,
      runs: ['awaiting_reply'],
    });

    const summary = new SummaryService({
      emails,
      verdicts,
      rules,
      predefined: new PredefinedRules(),
      timeZone: 'Asia/Kolkata',
      now: () => NOW,
    }).today();

    expect(summary).toEqual({
      date: '2026-10-08',
      since: '2026-10-07T18:30:00.000Z',
      received: 5,
      byRule: { 'To Reply': 2, Newsletter: 1, Dangerous: 1, 'Injection attempt': 1, Suspicious: 1 },
      needsReply: 3,
      meetingsProposed: 1,
      threats: { suspicious: 1, dangerous: 1, injection: 1 },
      highlights: [
        {
          gmailId: 'a',
          from: 'rahul@acme-corp.com',
          date: '2026-10-07T19:00:00.000Z',
          summary: 'Rahul asks for the deck.',
          untrusted: true,
        },
        {
          gmailId: 'c',
          from: 'rahul@acme-corp.com',
          date: '2026-10-08T04:00:00.000Z',
          summary: 'Meet Friday?',
          untrusted: true,
        },
      ],
    });
  });
});

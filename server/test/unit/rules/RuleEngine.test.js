import { beforeEach, describe, expect, it } from 'vitest';
import { SECURITY_LABELS } from '@mailmoat/shared/constants/labels';
import { ActionExecutor } from '../../../src/actions/ActionExecutor.js';
import { ApplyLabelTool } from '../../../src/agent/tools/ApplyLabelTool.js';
import { ArchiveTool } from '../../../src/agent/tools/ArchiveTool.js';
import { ToolRegistry } from '../../../src/agent/tools/ToolRegistry.js';
import { RuleError } from '../../../src/core/errors.js';
import { Logger } from '../../../src/core/Logger.js';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { EmailRepository } from '../../../src/db/repositories/EmailRepository.js';
import { RuleRepository } from '../../../src/db/repositories/RuleRepository.js';
import { SettingsRepository } from '../../../src/db/repositories/SettingsRepository.js';
import { VerdictRepository } from '../../../src/db/repositories/VerdictRepository.js';
import { PolicyEngine } from '../../../src/policy/PolicyEngine.js';
import { OrganizeRule } from '../../../src/policy/rules/OrganizeRule.js';
import { PredefinedRules } from '../../../src/rules/PredefinedRules.js';
import { RuleEngine } from '../../../src/rules/RuleEngine.js';
import { Verdict } from '../../../src/security/risk/Verdict.js';
import { VALID_FORM } from '../../../../shared/test/schemas/fixtures.js';

const NOW = new Date('2026-10-02T12:00:00Z');
const AUTH = {
  trusted: true,
  spf: { result: 'pass', mailFrom: null },
  dkim: [],
  dmarc: { result: 'pass', headerFrom: null },
};

let db;
let emails;
let verdicts;
let settings;
let gmail;
let audit;
let pipelineCalls;
let draftCalls;
let logs;

function form(overrides = {}) {
  return { ...VALID_FORM, meeting_request: null, needs_reply: false, ...overrides };
}

function verdict(level = 'SAFE', { injectionAttempt = false } = {}) {
  return new Verdict({
    level,
    score: level === 'SAFE' ? 0 : 50,
    reasons: level === 'SAFE' ? [] : ['reason'],
    floor: level,
    floorReasons: [],
    injectionAttempt,
    verifyByPhone: false,
  });
}

/** What SecurityPipeline.process returns, with the same outcome stored like the real one does. */
function analysis({
  level = 'SAFE',
  injectionAttempt = false,
  form: f = form(),
  signals = [],
} = {}) {
  return {
    email: null,
    signals: signals.map((id) => ({ id, name: id, severity: 'low', reason: 'r' })),
    reader: { failed: f === null, form: f },
    verdict: level === null ? null : verdict(level, { injectionAttempt }),
  };
}

function store(
  gmailId,
  { direction = 'inbound', threadId = `t-${gmailId}`, date, pending = false } = {},
) {
  const record = {
    gmailId,
    threadId,
    direction,
    fromAddr: direction === 'inbound' ? 'rahul@acme.example' : 'me@example.com',
    fromDomain: direction === 'inbound' ? 'acme.example' : 'example.com',
    fromName: null,
    toAddrs: [],
    recipientNames: {},
    date: date ?? '2026-10-02T09:00:00.000Z',
    subjectHash: null,
    hasListUnsubscribe: false,
    unsubscribeUrl: null,
    oneClick: false,
    labels: [],
    isRead: false,
  };
  emails.insertIfAbsent(record, { pending });
  return record;
}

function persist(record, result) {
  verdicts.save({
    gmailId: record.gmailId,
    at: NOW,
    bodyHash: 'h',
    auth: AUTH,
    signals: result.signals,
    readerForm: result.reader.form,
    readerModel: 'm',
    verdict: result.verdict,
  });
}

function engine({ pipelineResult = analysis(), gmailFailure = false } = {}) {
  const logger = new Logger({ level: 'warn', sink: (line) => logs.push(line) });
  const fakeGmail = {
    async ensureLabel(name) {
      return `Label_${name}`;
    },
    async modifyLabels(id, change) {
      if (gmailFailure) throw new Error('503');
      gmail.push(['modifyLabels', id, change]);
    },
    async archive(id) {
      gmail.push(['archive', id]);
    },
  };
  const auditLog = { record: (entry) => audit.push(entry) };
  return new RuleEngine({
    blocked: { handle: async (record) => record.fromAddr === 'spam@blocked.example' },
    pipeline: {
      async process(record) {
        pipelineCalls.push(record.gmailId);
        const result =
          typeof pipelineResult === 'function' ? pipelineResult(record) : pipelineResult;
        persist(record, result);
        return result;
      },
    },
    rules: new PredefinedRules(),
    repository: new RuleRepository(db),
    emails,
    verdicts,
    policy: new PolicyEngine({ rules: [new OrganizeRule()], emails, verdicts, logger }),
    executor: new ActionExecutor({
      registry: new ToolRegistry([
        new ApplyLabelTool({ gmail: fakeGmail }),
        new ArchiveTool({ gmail: fakeGmail }),
      ]),
      auditLog,
    }),
    drafts: {
      async createReply(input) {
        draftCalls.push(input);
        return { draftId: 'd1' };
      },
    },
    settings,
    auditLog,
    logger,
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
  gmail = [];
  audit = [];
  pipelineCalls = [];
  draftCalls = [];
  logs = [];
});

describe('RuleEngine.list / update', () => {
  it('lists the 12 rules with their defaults and allowed actions', () => {
    const list = engine().list();
    expect(list).toHaveLength(12);
    expect(list.find((r) => r.id === 'to_reply')).toEqual({
      id: 'to_reply',
      name: 'To Reply',
      description: expect.any(String),
      isSecurity: false,
      label: 'To Reply',
      enabled: true,
      actions: ['label', 'draft_reply'],
      allowedActions: ['label', 'archive', 'draft_reply'],
    });
    expect(list.find((r) => r.id === 'dangerous')).toMatchObject({
      isSecurity: true,
      enabled: true,
      actions: ['label', 'alert'],
      allowedActions: ['label', 'alert'],
    });
  });

  it('keeps the user’s toggles and action choices across restarts', () => {
    engine().update('marketing', { enabled: false, actions: ['label'] });
    const again = engine()
      .list()
      .find((r) => r.id === 'marketing');
    expect(again).toMatchObject({ enabled: false, actions: ['label'] });
    expect(audit.at(-1)).toMatchObject({
      actor: 'user',
      event: 'rule_updated',
      subject: 'marketing',
    });
  });

  it('rejects unknown rules, security rules and disallowed or duplicate actions', () => {
    const e = engine();
    expect(() => e.update('nope', { enabled: false })).toThrow(RuleError);
    expect(() => e.update('dangerous', { enabled: false })).toThrow(/always on/);
    expect(() => e.update('marketing', { actions: ['draft_reply'] })).toThrow(RuleError);
    expect(() => e.update('marketing', { actions: ['label', 'label'] })).toThrow(RuleError);
    expect(() => e.update('marketing', { actions: ['forward'] })).toThrow(RuleError);
    expect(e.list().find((r) => r.id === 'dangerous').enabled).toBe(true);
  });
});

describe('RuleEngine.process', () => {
  it('runs the pipeline, labels through the policy engine and executor, and records the run', async () => {
    const record = store('m1');
    const result = await engine({
      pipelineResult: analysis({ form: form({ category: 'receipt' }) }),
    }).process(record);

    expect(pipelineCalls).toEqual(['m1']);
    expect(result.verdict.level).toBe('SAFE');
    expect(result.rules).toEqual([
      {
        ruleId: 'receipt',
        name: 'Receipt',
        isSecurity: false,
        actions: ['label'],
        actionsTaken: ['label'],
        status: 'done',
      },
    ]);
    expect(gmail).toEqual([['modifyLabels', 'm1', { add: ['Label_Receipt'] }]]);
    expect(new RuleRepository(db).runsFor('m1')).toEqual([
      { ruleId: 'receipt', actionsTaken: ['label'], status: 'done', createdAt: NOW.toISOString() },
    ]);
    expect(audit.map((e) => e.event)).toEqual(['action_performed', 'rule_applied']);
    expect(audit[0]).toMatchObject({
      actor: 'system',
      subject: 'apply_label',
      data: {
        emailIds: ['m1'],
        sources: expect.arrayContaining([{ type: 'inbox' }, { type: 'user' }]),
      },
    });
    expect(audit[1]).toMatchObject({
      subject: 'm1',
      decision: 'done',
      reason: 'Receipt',
      data: { ruleId: 'receipt', actions: ['label'], failed: [], level: 'SAFE' },
    });
  });

  it('applies every chosen action: Marketing labels and archives by default', async () => {
    await engine({ pipelineResult: analysis({ form: form({ category: 'marketing' }) }) }).process(
      store('m1'),
    );
    expect(gmail).toEqual([
      ['modifyLabels', 'm1', { add: ['Label_Marketing'] }],
      ['archive', 'm1'],
    ]);
  });

  it('To Reply drafts a reply once, even when the rules run again', async () => {
    const e = engine({ pipelineResult: analysis({ form: form({ needs_reply: true }) }) });
    const record = store('m1');
    const first = await e.process(record);
    expect(first.rules[0]).toMatchObject({
      ruleId: 'to_reply',
      actionsTaken: ['label', 'draft_reply'],
    });
    expect(draftCalls).toEqual([{ gmailId: 'm1', instructions: null }]);

    const again = await e.apply(record, analysis({ form: form({ needs_reply: true }) }));
    expect(again[0]).toMatchObject({ actionsTaken: ['label', 'draft_reply'], status: 'done' });
    expect(draftCalls).toHaveLength(1);
  });

  it('respects the thread state: To Reply stops once the user answered, Awaiting Reply starts', async () => {
    const inbound = store('m1', { threadId: 't', date: '2026-10-02T09:00:00.000Z' });
    const e = engine({
      pipelineResult: (record) =>
        record.direction === 'outbound'
          ? analysis({ level: null, form: form({ expects_reply: true }) })
          : analysis({ form: form({ needs_reply: true }) }),
    });
    expect(e.evaluate(inbound, analysis({ form: form({ needs_reply: true }) }))).toMatchObject([
      { ruleId: 'to_reply' },
    ]);

    const sent = store('m2', {
      threadId: 't',
      direction: 'outbound',
      date: '2026-10-02T10:00:00.000Z',
    });
    expect(e.evaluate(inbound, analysis({ form: form({ needs_reply: true }) }))).toEqual([]);
    const outbound = analysis({ level: null, form: form({ expects_reply: true }) });
    expect(e.evaluate(sent, outbound)).toMatchObject([
      { ruleId: 'awaiting_reply', actions: ['label'] },
    ]);
    expect(
      e.evaluate(sent, analysis({ level: null, form: form({ expects_reply: false }) })),
    ).toEqual([]);
    // No security rule ever applies to the user's own mail (no verdict), only Awaiting Reply.
    await e.process(sent);
    expect(gmail).toEqual([['modifyLabels', 'm2', { add: ['Label_Awaiting Reply'] }]]);
  });

  it('a disabled rule takes no action on the next email', async () => {
    const e = engine({ pipelineResult: analysis({ form: form({ category: 'marketing' }) }) });
    e.update('marketing', { enabled: false });
    const result = await e.process(store('m1'));
    expect(result.rules).toEqual([]);
    expect(gmail).toEqual([]);
    expect(audit.filter((a) => a.event === 'rule_applied')).toEqual([]);
  });

  it('Cold Email needs the first-time-sender signal; a known sender falls through', async () => {
    const e = engine();
    const cold = form({ category: 'cold_outreach' });
    expect(e.evaluate(store('m1'), analysis({ form: cold, signals: ['S9'] }))).toMatchObject([
      { ruleId: 'cold_email', actions: ['label', 'archive'] },
    ]);
    expect(e.evaluate(store('m2'), analysis({ form: cold }))).toEqual([]);
  });

  it('security rules win: a SUSPICIOUS newsletter gets no assistant actions, only an alert', async () => {
    const result = await engine({
      pipelineResult: analysis({ level: 'SUSPICIOUS', form: form({ category: 'newsletter' }) }),
    }).process(store('m1'));
    expect(result.rules).toEqual([
      {
        ruleId: 'suspicious',
        name: 'Suspicious',
        isSecurity: true,
        actions: ['label', 'alert'],
        actionsTaken: ['label', 'alert'],
        status: 'done',
      },
    ]);
    // The pipeline applied the security label itself; the rule never touches Gmail.
    expect(gmail).toEqual([]);
    expect(audit.map((a) => a.event)).toEqual(['rule_applied']);
    expect(audit[0]).toMatchObject({ data: { isSecurity: true, level: 'SUSPICIOUS' } });
  });

  it('DANGEROUS and injection both match; archive is recorded only when the setting is on', async () => {
    const dangerous = analysis({ level: 'DANGEROUS', injectionAttempt: true, form: null });
    const e = engine({ pipelineResult: dangerous });
    expect((await e.process(store('m1'))).rules.map((r) => [r.ruleId, r.actionsTaken])).toEqual([
      ['dangerous', ['label', 'alert']],
      ['injection_attempt', ['label', 'log']],
    ]);
    settings.set('autoArchiveDangerous', true);
    expect(e.evaluate(store('m2'), dangerous)[0].actions).toEqual(['label', 'alert', 'archive']);
    expect(gmail).toEqual([]);
    expect(e.list().find((r) => r.id === 'dangerous').label).toBe(SECURITY_LABELS.DANGEROUS);
  });

  it('records a failed action without failing the email, so the Reader is not re-run', async () => {
    const result = await engine({
      pipelineResult: analysis({ form: form({ category: 'marketing' }) }),
      gmailFailure: true,
    }).process(store('m1'));
    expect(result.rules[0]).toMatchObject({ actionsTaken: ['archive'], status: 'failed' });
    expect(new RuleRepository(db).runsFor('m1')[0]).toMatchObject({
      actionsTaken: ['archive'],
      status: 'failed',
    });
    expect(audit.at(-1)).toMatchObject({ decision: 'failed', data: { failed: ['label'] } });
    expect(logs.join('\n')).toContain('rule action failed');
  });

  it('refuses an action the Policy Engine does not allow', async () => {
    const e = engine({ pipelineResult: analysis({ form: form({ category: 'receipt' }) }) });
    const strictPolicy = new PolicyEngine({
      rules: [],
      emails,
      verdicts,
      logger: new Logger({ level: 'error', sink: () => {} }),
    });
    const denied = new RuleEngine({
      blocked: { handle: async () => false },
      pipeline: { process: async (r) => e.process(r) },
      rules: new PredefinedRules(),
      repository: new RuleRepository(db),
      emails,
      verdicts,
      policy: strictPolicy,
      executor: {
        perform: async () => {
          throw new Error('must not run');
        },
      },
      drafts: { createReply: async () => ({ draftId: 'x' }) },
      settings,
      auditLog: { record: (entry) => audit.push(entry) },
      logger: new Logger({ level: 'error', sink: () => {} }),
      timeZone: 'UTC',
      now: () => NOW,
    });
    const record = store('m1');
    const runs = await denied.apply(record, analysis({ form: form({ category: 'receipt' }) }));
    expect(runs[0]).toMatchObject({ status: 'failed', actionsTaken: [] });
  });
});

describe('RuleEngine.process with a blocked sender', () => {
  it('skips the pipeline and the rules for mail the blocked-sender filter handled', async () => {
    const e = engine();
    const record = store('m1');
    const result = await e.process({ ...record, fromAddr: 'spam@blocked.example' });
    expect(result).toEqual({
      email: null,
      signals: [],
      reader: { failed: false, form: null },
      verdict: null,
      rules: [],
      blocked: true,
    });
    expect(pipelineCalls).toEqual([]);
    expect((await e.process(record)).blocked).toBe(false);
  });
});

describe('RuleEngine.processPast', () => {
  it('re-runs the rules on stored analyses and runs the pipeline only for never-analysed mail', async () => {
    const e = engine({
      pipelineResult: (record) =>
        record.gmailId === 'fresh'
          ? analysis({ form: form({ category: 'newsletter' }) })
          : analysis({ form: form({ category: 'receipt' }) }),
    });
    const analysed = store('old-analysed', { date: '2026-09-29T09:00:00.000Z' });
    persist(analysed, analysis({ level: 'SUSPICIOUS', form: form({ category: 'marketing' }) }));
    store('fresh', { date: '2026-09-30T09:00:00.000Z' });
    store('pending', { date: '2026-10-01T09:00:00.000Z', pending: true });
    store('too-old', { date: '2026-09-01T09:00:00.000Z' });
    const sent = store('sent', { direction: 'outbound', date: '2026-10-01T10:00:00.000Z' });
    persist(sent, analysis({ level: null, form: form({ expects_reply: true }) }));
    const progress = [];

    const result = await e.processPast({ days: 7, onProgress: (p) => progress.push(p) });

    expect(result).toEqual({ total: 3, analysed: 1, matched: 3, failed: 0 });
    expect(pipelineCalls).toEqual(['fresh']);
    expect(progress).toEqual([
      { done: 1, total: 3 },
      { done: 2, total: 3 },
      { done: 3, total: 3 },
    ]);
    const history = e.history();
    expect(history.map((h) => [h.gmailId, h.ruleId, h.level])).toEqual([
      ['sent', 'awaiting_reply', null],
      ['fresh', 'newsletter', 'SAFE'],
      ['old-analysed', 'suspicious', 'SUSPICIOUS'],
    ]);
    expect(e.history({ ruleId: 'newsletter' })).toHaveLength(1);
    // The stored SUSPICIOUS verdict kept the marketing rule from archiving anything.
    expect(gmail).toEqual([
      ['modifyLabels', 'fresh', { add: ['Label_Newsletter'] }],
      ['modifyLabels', 'sent', { add: ['Label_Awaiting Reply'] }],
    ]);
  });

  it('counts an email whose pipeline run throws as failed and carries on', async () => {
    const e = engine({
      pipelineResult: (record) => {
        if (record.gmailId === 'boom') throw new Error('Gmail 503');
        return analysis({ form: form({ category: 'receipt' }) });
      },
    });
    store('boom', { date: '2026-10-01T09:00:00.000Z' });
    store('fine', { date: '2026-10-01T10:00:00.000Z' });
    expect(await e.processPast()).toEqual({ total: 2, analysed: 1, matched: 1, failed: 1 });
    expect(logs.join('\n')).toContain('process-past failed');
  });
});

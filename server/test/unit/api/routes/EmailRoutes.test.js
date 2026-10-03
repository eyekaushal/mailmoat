import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActionExecutor } from '../../../../src/actions/ActionExecutor.js';
import { ArchiveTool } from '../../../../src/agent/tools/ArchiveTool.js';
import { ToolRegistry } from '../../../../src/agent/tools/ToolRegistry.js';
import { EmailRoutes } from '../../../../src/api/routes/EmailRoutes.js';
import { AuditLog } from '../../../../src/audit/AuditLog.js';
import { Logger } from '../../../../src/core/Logger.js';
import { Database } from '../../../../src/db/Database.js';
import { Migrator } from '../../../../src/db/Migrator.js';
import { AuditLogRepository } from '../../../../src/db/repositories/AuditLogRepository.js';
import { ContactRepository } from '../../../../src/db/repositories/ContactRepository.js';
import { EmailRepository } from '../../../../src/db/repositories/EmailRepository.js';
import { RuleRepository } from '../../../../src/db/repositories/RuleRepository.js';
import { VerdictRepository } from '../../../../src/db/repositories/VerdictRepository.js';
import { MeetingError } from '../../../../src/core/errors.js';
import { PolicyEngine } from '../../../../src/policy/PolicyEngine.js';
import { OrganizeRule } from '../../../../src/policy/rules/OrganizeRule.js';
import { PredefinedRules } from '../../../../src/rules/PredefinedRules.js';
import { startApi } from '../../../helpers/apiServer.js';
import { storeEmail } from '../../../helpers/inboxFixtures.js';

let db;
let repos;
let api;
let archived;
let drafted;
let proposed;

beforeEach(async () => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
  const rules = new RuleRepository(db);
  rules.seed(
    new PredefinedRules().list().map(({ id, name, defaultActions, isSecurity }) => ({
      id,
      name,
      actions: defaultActions,
      isSecurity,
    })),
  );
  repos = {
    emails: new EmailRepository(db),
    verdicts: new VerdictRepository(db),
    rules,
    contacts: new ContactRepository(db),
    audit: new AuditLogRepository(db),
  };
  archived = [];
  drafted = [];
  proposed = [];
  const logger = new Logger({ level: 'error', sink: () => {} });
  const auditLog = new AuditLog(repos.audit);
  const registry = new ToolRegistry([
    new ArchiveTool({ gmail: { archive: async (id) => archived.push(id) } }),
  ]);
  api = await startApi({
    routes: [
      new EmailRoutes({
        ...repos,
        policy: new PolicyEngine({
          rules: [new OrganizeRule()],
          emails: repos.emails,
          verdicts: repos.verdicts,
          logger,
        }),
        executor: new ActionExecutor({ registry, auditLog }),
        drafts: {
          createReply: async (input) => {
            drafted.push(input);
            return { draftId: 'd1' };
          },
        },
        meetings: {
          propose: async (input) => {
            proposed.push(input);
            if (input.gmailId === 'risky' && !input.allowRisky) throw new MeetingError('risky');
            return { title: 'Catch-up', slots: [] };
          },
          save: async (card, options) => ({
            approvalId: 'a1',
            eventId: 'e1',
            link: 'L',
            card,
            options,
          }),
        },
        auditLog,
        timeZone: 'Asia/Kolkata',
        now: () => new Date('2026-10-08T10:00:00Z'),
      }),
    ],
  });
});

afterEach(() => api.close());

describe('GET /api/emails', () => {
  it('lists inbound mail newest first with verdict, Reader fields and matched rules, paginated', async () => {
    storeEmail(repos, 'a', { date: '2026-10-01T09:00:00.000Z', ruleIds: ['fyi'] });
    storeEmail(repos, 'b', {
      date: '2026-10-02T09:00:00.000Z',
      level: 'DANGEROUS',
      score: 90,
      reasons: ['x'],
      ruleIds: ['dangerous'],
    });
    storeEmail(repos, 'c', { date: '2026-10-03T09:00:00.000Z', ruleIds: ['to_reply', 'fyi'] });
    storeEmail(repos, 'sent', {
      direction: 'outbound',
      date: '2026-10-04T09:00:00.000Z',
      ruleIds: ['awaiting_reply'],
    });

    const first = await api.get('/api/emails?limit=2');
    expect(first.status).toBe(200);
    expect(first.json.items.map((e) => e.gmailId)).toEqual(['c', 'b']);
    expect(first.json.items[0]).toMatchObject({
      rules: ['fyi', 'to_reply'],
      category: 'work',
      summary: 'A note.',
      verdict: { level: 'SAFE', score: 0, injectionAttempt: false, userFeedback: null },
    });
    expect(first.json.items[0]).not.toHaveProperty('body');
    expect(first.json.nextCursor).toEqual(expect.any(String));

    const second = await api.get(`/api/emails?limit=2&cursor=${first.json.nextCursor}`);
    expect(second.json.items.map((e) => e.gmailId)).toEqual(['a']);
    expect(second.json.nextCursor).toBeNull();
  });

  it('filters by tab (rule) and by risk, and validates the query', async () => {
    storeEmail(repos, 'a', { ruleIds: ['fyi'] });
    storeEmail(repos, 'b', { level: 'SUSPICIOUS', ruleIds: ['suspicious'] });
    storeEmail(repos, 'sent', { direction: 'outbound', ruleIds: ['awaiting_reply'] });
    expect((await api.get('/api/emails?label=fyi')).json.items.map((e) => e.gmailId)).toEqual([
      'a',
    ]);
    expect(
      (await api.get('/api/emails?label=awaiting_reply')).json.items.map((e) => e.gmailId),
    ).toEqual(['sent']);
    expect((await api.get('/api/emails?risk=SUSPICIOUS')).json.items.map((e) => e.gmailId)).toEqual(
      ['b'],
    );
    expect((await api.get('/api/emails?risk=BAD')).status).toBe(400);
    expect((await api.get('/api/emails?label=Not%20A%20Slug')).status).toBe(400);
    expect((await api.get('/api/emails?cursor=nonsense')).status).toBe(400);
    expect((await api.get('/api/emails?limit=0')).status).toBe(400);
  });

  it('counts unread mail per tab', async () => {
    storeEmail(repos, 'a', { ruleIds: ['fyi'] });
    storeEmail(repos, 'b', { ruleIds: ['fyi'], isRead: true });
    storeEmail(repos, 'c', { level: 'DANGEROUS', ruleIds: ['dangerous'] });
    expect((await api.get('/api/emails/counts')).json).toEqual({
      all: 2,
      byRule: { fyi: 1, dangerous: 1 },
      byLevel: { SAFE: 1, DANGEROUS: 1 },
    });
  });
});

describe('GET /api/emails/:id and /trace', () => {
  it('returns the stored facts about one email and 404 for unknown ids', async () => {
    storeEmail(repos, 'a', {
      level: 'SUSPICIOUS',
      reasons: ['DMARC failed'],
      ruleIds: ['suspicious'],
    });
    repos.contacts.recordSent('rahul@acme-corp.com', new Date('2026-01-01'));
    const res = await api.get('/api/emails/a');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      email: { gmailId: 'a', fromAddr: 'rahul@acme-corp.com' },
      verdict: { level: 'SUSPICIOUS', reasons: ['DMARC failed'], userFeedback: null },
      readerForm: { summary: 'A note.' },
      signals: [{ id: 'S1', severity: 'high', reason: 'DMARC failed' }],
      rules: [{ ruleId: 'suspicious', actionsTaken: ['label'], status: 'done' }],
      sender: { trusted: false, sentCount: 1, receivedCount: 0 },
    });
    expect((await api.get('/api/emails/zzz')).status).toBe(404);
    expect((await api.get('/api/emails/bad%20id')).status).toBe(400);
  });

  it('exposes the pipeline trace: auth, signals, Reader form, verdict, rules and audit events', async () => {
    storeEmail(repos, 'a', {
      level: 'DANGEROUS',
      score: 95,
      reasons: ['r1'],
      injectionAttempt: true,
    });
    repos.audit.append({
      ts: 't',
      actor: 'system',
      event: 'email_analysed',
      subject: 'a',
      decision: 'DANGEROUS',
    });
    repos.audit.append({ ts: 't', actor: 'system', event: 'email_analysed', subject: 'other' });
    const res = await api.get('/api/emails/a/trace');
    expect(res.json).toMatchObject({
      gmailId: 'a',
      auth: { spf: 'pass', dkim: 'pass', dkimDomain: 'acme-corp.com', dmarc: 'pass' },
      reader: { failed: false },
      verdict: { level: 'DANGEROUS', floor: 'DANGEROUS', injectionAttempt: true },
      events: [{ event: 'email_analysed', subject: 'a' }],
    });
    expect(res.json.events).toHaveLength(1);
  });
});

describe('POST /api/emails/:id actions', () => {
  it('archives through the Policy Engine and the executor, recording the action', async () => {
    storeEmail(repos, 'a');
    const res = await api.post('/api/emails/a/archive');
    expect(res.status).toBe(200);
    expect(res.json).toEqual({
      gmailId: 'a',
      done: true,
      decision: 'ALLOW',
      reason: 'Reversible inbox change',
    });
    expect(archived).toEqual(['a']);
    expect(repos.audit.recent({ event: 'action_performed' })).toHaveLength(1);
  });

  it('drafts a reply and proposes/saves meetings via the services, validating input', async () => {
    storeEmail(repos, 'a');
    storeEmail(repos, 'risky', { level: 'SUSPICIOUS' });
    const draft = await api.post('/api/emails/a/draft-reply', { instructions: 'Say yes' });
    expect(draft.status).toBe(201);
    expect(draft.json).toEqual({ gmailId: 'a', draftId: 'd1' });
    expect(drafted).toEqual([{ gmailId: 'a', instructions: 'Say yes', allowSuspicious: false }]);
    expect((await api.post('/api/emails/a/draft-reply', { extra: 1 })).status).toBe(400);

    expect((await api.post('/api/emails/risky/propose-meeting')).status).toBe(400);
    const ok = await api.post('/api/emails/risky/propose-meeting', { allowRisky: true });
    expect(ok.json).toEqual({ title: 'Catch-up', slots: [] });

    const card = {
      title: 'Catch-up',
      start: '2026-10-09T10:00:00+05:30',
      end: '2026-10-09T10:30:00+05:30',
      attendees: ['rahul@acme-corp.com'],
    };
    const saved = await api.post('/api/emails/a/save-meeting', card);
    expect(saved.status).toBe(201);
    expect(saved.json).toMatchObject({
      eventId: 'e1',
      card: { gmailId: 'a', ...card },
      options: { via: 'dashboard' },
    });
    expect(
      (await api.post('/api/emails/a/save-meeting', { ...card, attendees: ['nope'] })).status,
    ).toBe(400);
  });

  it('stores "trusted sender" and "not phishing" as user-sourced facts without lowering the verdict', async () => {
    storeEmail(repos, 'a', { level: 'SUSPICIOUS' });
    const trusted = await api.post('/api/emails/a/trust-sender');
    expect(trusted.json).toEqual({ address: 'rahul@acme-corp.com', trusted: true });
    expect(repos.contacts.get('rahul@acme-corp.com').trusted).toBe(true);
    await api.post('/api/emails/a/trust-sender', { trusted: false });
    expect(repos.contacts.get('rahul@acme-corp.com').trusted).toBe(false);

    const feedback = await api.post('/api/emails/a/not-phishing');
    expect(feedback.json.verdict).toMatchObject({
      level: 'SUSPICIOUS',
      userFeedback: 'not_phishing',
    });
    expect(repos.audit.recent({ event: 'verdict_feedback' })[0]).toMatchObject({
      actor: 'user',
      subject: 'a',
      decision: 'not_phishing',
    });
    await api.post('/api/emails/a/not-phishing', { notPhishing: false });
    expect(repos.verdicts.get('a').userFeedback).toBeNull();

    storeEmail(repos, 'sent', { direction: 'outbound' });
    expect((await api.post('/api/emails/sent/not-phishing')).status).toBe(404);
  });
});

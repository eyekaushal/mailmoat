import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActionExecutor } from '../../../../src/actions/ActionExecutor.js';
import { MarkReadTool } from '../../../../src/agent/tools/MarkReadTool.js';
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
import { DraftError, MeetingError } from '../../../../src/core/errors.js';
import { PolicyEngine } from '../../../../src/policy/PolicyEngine.js';
import { SendRule } from '../../../../src/policy/rules/SendRule.js';
import { OrganizeRule } from '../../../../src/policy/rules/OrganizeRule.js';
import { PredefinedRules } from '../../../../src/rules/PredefinedRules.js';
import { startApi } from '../../../helpers/apiServer.js';
import { storeEmail } from '../../../helpers/inboxFixtures.js';

let db;
let repos;
let api;
let archived;
let readIds;
let drafted;
let requested;
let discarded;
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
  readIds = [];
  drafted = [];
  requested = [];
  discarded = [];
  proposed = [];
  const logger = new Logger({ level: 'error', sink: () => {} });
  const auditLog = new AuditLog(repos.audit);
  const registry = new ToolRegistry([
    new ArchiveTool({ gmail: { archive: async (id) => archived.push(id) } }),
    new MarkReadTool({ gmail: { modifyLabels: async (id) => readIds.push(id) } }),
  ]);
  api = await startApi({
    routes: [
      new EmailRoutes({
        ...repos,
        policy: new PolicyEngine({
          rules: [new OrganizeRule(), new SendRule()],
          emails: repos.emails,
          verdicts: repos.verdicts,
          logger,
        }),
        executor: new ActionExecutor({ registry, auditLog }),
        drafts: {
          compose: async (input) => {
            drafted.push(input);
            return { text: 'Dear Rahul,\n\nYes.\n\nBest regards,\nKaushal' };
          },
          saveReply: async (input) => {
            drafted.push({
              saved: input.text,
              origin: input.body.sources,
              replaces: input.replacesDraftId,
            });
            return { draftId: 'd1' };
          },
          envelope: async (gmailId) => {
            const record = repos.emails.get(gmailId);
            const level = repos.verdicts.get(gmailId)?.level ?? 'SUSPICIOUS';
            if (level === 'DANGEROUS')
              throw new DraftError('No reply is drafted for a DANGEROUS email');
            return {
              to: record.fromAddr,
              subject: 'Re: Hello',
              inReplyTo: '<m1@acme-corp.com>',
              threadId: record.threadId,
              level,
            };
          },
          discard: async (draftId) => {
            discarded.push(draftId);
          },
        },
        approvals: {
          request: async ({ call, reason }) => {
            requested.push({ call, reason });
            return { id: 'ap-1' };
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

describe('GET /api/emails/:id/sender', () => {
  it('describes the sender with the newest message of each thread they wrote to', async () => {
    const from = { fromAddr: 'rahul@acme-corp.com', fromName: 'Rahul Mehta' };
    storeEmail(repos, 'old', { ...from, threadId: 't1', date: '2026-10-01T09:00:00.000Z' });
    storeEmail(repos, 'new', {
      ...from,
      threadId: 't1',
      date: '2026-10-03T09:00:00.000Z',
      level: 'SUSPICIOUS',
      score: 40,
      reasons: ['x'],
    });
    storeEmail(repos, 'other', { ...from, threadId: 't2', date: '2026-10-02T09:00:00.000Z' });
    storeEmail(repos, 'else', { fromAddr: 'priya@partnerco.io', threadId: 't3' });
    repos.contacts.recordSent('rahul@acme-corp.com', new Date('2026-09-01T09:00:00Z'));
    repos.contacts.setTrusted('rahul@acme-corp.com', true, new Date('2026-09-02T09:00:00Z'));

    const response = await api.get('/api/emails/old/sender');
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({
      threadId: 't1',
      address: 'rahul@acme-corp.com',
      name: 'Rahul Mehta',
      trusted: true,
      sentCount: 1,
      avatar: { initials: 'RM' },
    });
    expect(response.json.threads).toEqual([
      {
        threadId: 't1',
        gmailId: 'new',
        subject: '',
        date: '2026-10-03T09:00:00.000Z',
        isRead: false,
        verdict: { level: 'SUSPICIOUS' },
      },
      {
        threadId: 't2',
        gmailId: 'other',
        subject: '',
        date: '2026-10-02T09:00:00.000Z',
        isRead: false,
        verdict: { level: 'SAFE' },
      },
    ]);
    expect(JSON.stringify(response.json)).not.toContain('A note.');
  });

  it('404s for an unknown email', async () => {
    expect((await api.get('/api/emails/nope/sender')).status).toBe(404);
  });

  it('no longer serves raw message content: the thread route is the only reading path', async () => {
    storeEmail(repos, 'a');
    expect((await api.get('/api/emails/a/content')).status).toBe(404);
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
    expect(first.json.items[0]).toMatchObject({
      subject: '',
      snippet: '',
      avatar: { initials: 'R', hue: expect.any(Number) },
    });
    expect(first.json.nextCursor).toEqual(expect.any(String));

    const second = await api.get(`/api/emails?limit=2&cursor=${first.json.nextCursor}`);
    expect(second.json.items.map((e) => e.gmailId)).toEqual(['a']);
    expect(second.json.nextCursor).toBeNull();
  });

  it('carries the stored subject, snippet and initials from the display name', async () => {
    const record = storeEmail(repos, 'a', { fromName: 'Rahul Mehta' });
    repos.emails.insertIfAbsent(
      {
        ...record,
        gmailId: 'b',
        threadId: 't-b',
        subject: 'Deck for Friday',
        snippet: 'Attached is the deck…',
      },
      { pending: false },
    );
    const { items } = (await api.get('/api/emails')).json;
    expect(items.find((i) => i.gmailId === 'b')).toMatchObject({
      subject: 'Deck for Friday',
      snippet: 'Attached is the deck…',
      avatar: { initials: 'RM' },
    });
    expect(items[0].avatar.hue).toBe(items[1].avatar.hue);
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
  it('archives through the Policy Engine and the executor, recording the action and leaving the inbox', async () => {
    storeEmail(repos, 'a');
    const res = await api.post('/api/emails/a/archive');
    expect(repos.emails.get('a').labels).toEqual([]);
    expect(repos.emails.page().items).toEqual([]);
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

  it('marks an opened email read in Gmail and locally, through the Policy Engine', async () => {
    storeEmail(repos, 'a');
    expect(repos.emails.get('a').isRead).toBe(false);
    const res = await api.post('/api/emails/a/read');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ gmailId: 'a', done: true, decision: 'ALLOW' });
    expect(readIds).toEqual(['a']);
    expect(repos.emails.get('a').isRead).toBe(true);
    expect(repos.emails.unreadCounts().all).toBe(0);
    expect((await api.post('/api/emails/nope/read')).status).toBe(404);
  });

  it('composes with AI without saving, saves the edited text as a draft, and deletes drafts', async () => {
    storeEmail(repos, 'a');
    const composed = await api.post('/api/emails/a/compose', { instructions: 'Say yes' });
    expect(composed.status).toBe(200);
    expect(composed.json).toEqual({ gmailId: 'a', text: expect.stringContaining('Yes.') });
    expect(drafted).toEqual([{ gmailId: 'a', instructions: 'Say yes', allowSuspicious: false }]);
    expect((await api.post('/api/emails/a/compose', { extra: 1 })).status).toBe(400);

    const saved = await api.post('/api/emails/a/save-reply', {
      body: 'Dear Rahul, yes.',
      origin: 'ai',
      draftId: 'old-draft',
    });
    expect(saved.status).toBe(201);
    expect(saved.json).toEqual({ gmailId: 'a', draftId: 'd1' });
    // An edited AI draft keeps the email's taint next to the user's.
    expect(drafted[1]).toEqual({
      saved: 'Dear Rahul, yes.',
      origin: [{ type: 'user' }, { type: 'email', id: 'a' }],
      replaces: 'old-draft',
    });
    expect((await api.post('/api/emails/a/save-reply', { body: '' })).status).toBe(400);

    expect((await api.delete('/api/drafts/old-draft')).json).toEqual({
      draftId: 'old-draft',
      deleted: true,
    });
    expect(discarded).toEqual(['old-draft']);
  });

  it('turns "send for approval" into a send_email approval and never sends (PLAN §14)', async () => {
    storeEmail(repos, 'a');
    storeEmail(repos, 'risky', { level: 'SUSPICIOUS' });
    storeEmail(repos, 'bad', { level: 'DANGEROUS' });

    const asked = await api.post('/api/emails/a/reply-request', {
      body: 'Dear Rahul, yes.',
      origin: 'user',
      draftId: 'd-old',
    });
    expect(asked.status).toBe(201);
    expect(asked.json).toEqual({
      approvalId: 'ap-1',
      decision: 'ASK',
      reason: 'Sending an email needs your approval',
    });
    const { call } = requested[0];
    expect(call.tool).toBe('send_email');
    expect(call.emailIds).toEqual(['a']);
    expect(call.args.to.value).toEqual(['rahul@acme-corp.com']);
    expect(call.args.to.sources).toEqual([{ type: 'user' }]);
    expect(call.args.subject.value).toBe('Re: Hello');
    expect(call.args.body.sources).toEqual([{ type: 'user' }]);
    expect(call.args.in_reply_to.value).toBe('<m1@acme-corp.com>');
    expect(call.args.thread_id.value).toBe('t-a');
    expect(call.args.draft_id.value).toBe('d-old');

    const warned = await api.post('/api/emails/risky/reply-request', { body: 'Hi', origin: 'ai' });
    expect(warned.json.reason).toMatch(/SUSPICIOUS/);
    expect(requested[1].call.args.body.sources).toEqual([
      { type: 'user' },
      { type: 'email', id: 'risky' },
    ]);

    expect((await api.post('/api/emails/bad/reply-request', { body: 'Hi' })).status).toBe(400);
    expect(requested).toHaveLength(2);
    expect(repos.audit.recent({ event: 'action_performed' })).toHaveLength(0);
  });

  it('proposes and saves meetings via the services, validating input', async () => {
    storeEmail(repos, 'a');
    storeEmail(repos, 'risky', { level: 'SUSPICIOUS' });
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

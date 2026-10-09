import { beforeEach, describe, expect, it } from 'vitest';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { AuditLogRepository } from '../../../src/db/repositories/AuditLogRepository.js';
import { ContactRepository } from '../../../src/db/repositories/ContactRepository.js';
import { EmailRepository } from '../../../src/db/repositories/EmailRepository.js';
import { RuleRepository } from '../../../src/db/repositories/RuleRepository.js';
import { VerdictRepository } from '../../../src/db/repositories/VerdictRepository.js';
import { storeEmail } from '../../helpers/inboxFixtures.js';
import { SettingsRepository } from '../../../src/db/repositories/SettingsRepository.js';
import { SyncStateRepository } from '../../../src/db/repositories/SyncStateRepository.js';

let db;

beforeEach(() => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
});

describe('SettingsRepository', () => {
  it('stores JSON values and returns a fallback when missing', () => {
    const settings = new SettingsRepository(db);
    expect(settings.get('pollIntervalSeconds', 60)).toBe(60);
    settings.set('pollIntervalSeconds', 30);
    settings.set('workingHours', { start: '09:00', end: '18:00' });
    expect(settings.get('pollIntervalSeconds', 60)).toBe(30);
    expect(settings.all()).toEqual({
      pollIntervalSeconds: 30,
      workingHours: { start: '09:00', end: '18:00' },
    });
  });
});

describe('SyncStateRepository', () => {
  it('starts empty and remembers where sync left off', () => {
    const sync = new SyncStateRepository(db);
    expect(sync.getHistoryId()).toBeNull();
    expect(sync.getLastPollAt()).toBeNull();
    sync.setHistoryId('12345');
    sync.markPolled(new Date('2026-10-01T10:00:00Z'));
    expect(sync.getHistoryId()).toBe('12345');
    expect(sync.getLastPollAt()).toEqual(new Date('2026-10-01T10:00:00Z'));
  });
});

describe('Database.transaction', () => {
  it('rolls back every write when the work throws', () => {
    const settings = new SettingsRepository(db);
    expect(() =>
      db.transaction(() => {
        settings.set('a', 1);
        throw new Error('stop');
      }),
    ).toThrow('stop');
    expect(settings.get('a')).toBeUndefined();
  });
});

describe('ContactRepository names', () => {
  it('keeps the latest non-empty name the user used', () => {
    const contacts = new ContactRepository(db);
    contacts.recordSent('rahul@acme-corp.com', new Date('2026-01-01'), 'Rahul');
    contacts.recordSent('rahul@acme-corp.com', new Date('2026-02-01'), 'Rahul Mehta');
    contacts.recordSent('rahul@acme-corp.com', new Date('2026-03-01'));
    contacts.recordReceived('rahul@acme-corp.com', new Date('2026-04-01'));
    expect(contacts.get('rahul@acme-corp.com')).toMatchObject({
      name: 'Rahul Mehta',
      sentCount: 3,
    });
  });
});

describe('EmailRepository.search', () => {
  const base = {
    threadId: 't',
    direction: 'inbound',
    fromName: null,
    toAddrs: ['me@example.com'],
    recipientNames: {},
    subjectHash: null,
    hasListUnsubscribe: false,
    unsubscribeUrl: null,
    oneClick: false,
    labels: ['INBOX'],
    isRead: false,
  };
  const insert = (repo, gmailId, fields) =>
    repo.insertIfAbsent(
      {
        ...base,
        gmailId,
        fromAddr: 'a@x.example',
        fromDomain: 'x.example',
        date: '2026-10-01T00:00:00.000Z',
        ...fields,
      },
      { pending: false },
    );

  it('filters by sender, domain, direction and time, newest first', async () => {
    const { EmailRepository } = await import('../../../src/db/repositories/EmailRepository.js');
    const repo = new EmailRepository(db);
    insert(repo, '1', { date: '2026-10-01T00:00:00.000Z' });
    insert(repo, '2', { date: '2026-10-03T00:00:00.000Z', fromAddr: 'b@x.example' });
    insert(repo, '3', {
      date: '2026-10-02T00:00:00.000Z',
      fromAddr: 'c@y.example',
      fromDomain: 'y.example',
      direction: 'outbound',
    });
    expect(repo.search().map((r) => r.gmailId)).toEqual(['2', '3', '1']);
    expect(repo.search({ from: 'A@x.example' }).map((r) => r.gmailId)).toEqual(['1']);
    expect(repo.search({ from: 'x.example' }).map((r) => r.gmailId)).toEqual(['2', '1']);
    expect(repo.search({ direction: 'outbound' }).map((r) => r.gmailId)).toEqual(['3']);
    expect(
      repo
        .search({ since: '2026-10-02T00:00:00.000Z', until: '2026-10-02T23:59:59.000Z' })
        .map((r) => r.gmailId),
    ).toEqual(['3']);
    expect(repo.search({ limit: 1 }).map((r) => r.gmailId)).toEqual(['2']);
  });
});

describe('EmailRepository threads and past mail', () => {
  const record = (gmailId, { threadId = 't1', direction = 'inbound', date, pending = false }) => ({
    gmailId,
    threadId,
    direction,
    fromAddr: direction === 'inbound' ? 'rahul@acme.example' : 'me@example.com',
    fromDomain: direction === 'inbound' ? 'acme.example' : 'example.com',
    fromName: null,
    toAddrs: [],
    recipientNames: {},
    date,
    subjectHash: null,
    hasListUnsubscribe: false,
    unsubscribeUrl: null,
    oneClick: false,
    labels: ['INBOX'],
    isRead: false,
    pending,
  });

  it('finds the newest message of a thread and lists processed mail since a date', async () => {
    const { EmailRepository } = await import('../../../src/db/repositories/EmailRepository.js');
    const repo = new EmailRepository(db);
    for (const r of [
      record('a', { date: '2026-10-01T09:00:00.000Z' }),
      record('b', { direction: 'outbound', date: '2026-10-01T10:00:00.000Z' }),
      record('c', { threadId: 't2', date: '2026-10-02T10:00:00.000Z', pending: true }),
      record('old', { threadId: 't3', date: '2026-09-01T10:00:00.000Z' }),
    ]) {
      repo.insertIfAbsent(r, { pending: r.pending });
    }
    expect(repo.latestInThread('t1')?.gmailId).toBe('b');
    expect(repo.latestInThread('t2')?.gmailId).toBe('c');
    expect(repo.latestInThread('none')).toBeUndefined();
    // Oldest first; pending mail belongs to the sync loop, not to "process past emails".
    expect(repo.listProcessedSince('2026-09-25T00:00:00.000Z').map((r) => r.gmailId)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('SenderRepository.setStatus', () => {
  it('upserts the status and rejects unknown ones', async () => {
    const { SenderRepository } = await import('../../../src/db/repositories/SenderRepository.js');
    const repo = new SenderRepository(db);
    repo.setStatus('News@List.example', 'BLOCKED');
    expect(repo.get('news@list.example')).toMatchObject({ status: 'BLOCKED', emailCount: 0 });
    repo.recordReceived('news@list.example', {
      at: new Date('2026-10-01T00:00:00Z'),
      isRead: false,
    });
    repo.setStatus('news@list.example', 'KEPT');
    expect(repo.get('news@list.example')).toMatchObject({ status: 'KEPT', emailCount: 1 });
    expect(() => repo.setStatus('news@list.example', 'MUTED')).toThrow(RangeError);
  });
});

describe('ApprovalRepository', () => {
  it('creates, lists pending oldest first, updates and decides once', async () => {
    const { ApprovalRepository } =
      await import('../../../src/db/repositories/ApprovalRepository.js');
    const repo = new ApprovalRepository(db);
    repo.create({
      id: 'b',
      kind: 'send_email',
      payload: { x: 2 },
      sources: [{ type: 'user' }],
      requestedAt: '2026-10-05T11:00:00.000Z',
    });
    repo.create({
      id: 'a',
      kind: 'reply',
      payload: { x: 1 },
      sources: [],
      requestedAt: '2026-10-05T10:00:00.000Z',
    });
    expect(repo.listPending().map((r) => r.id)).toEqual(['a', 'b']);
    expect(repo.get('b')).toEqual({
      id: 'b',
      kind: 'send_email',
      payload: { x: 2 },
      sources: [{ type: 'user' }],
      status: 'PENDING',
      requestedAt: '2026-10-05T11:00:00.000Z',
      decidedAt: null,
      decidedVia: null,
    });
    repo.updatePayload('b', { x: 3 });
    expect(repo.get('b').payload).toEqual({ x: 3 });
    expect(
      repo.decide('b', {
        status: 'APPROVED',
        decidedAt: '2026-10-05T12:00:00.000Z',
        via: 'dashboard',
      }),
    ).toBe(true);
    expect(
      repo.decide('b', {
        status: 'REJECTED',
        decidedAt: '2026-10-05T12:00:00.000Z',
        via: 'dashboard',
      }),
    ).toBe(false);
    repo.updatePayload('b', { x: 4 });
    expect(repo.get('b')).toMatchObject({
      status: 'APPROVED',
      payload: { x: 3 },
      decidedVia: 'dashboard',
    });
    expect(repo.listPending().map((r) => r.id)).toEqual(['a']);
    expect(repo.get('zzz')).toBeUndefined();
  });
});

describe('MemoryRepository', () => {
  it('stores only user-sourced content', async () => {
    const { MemoryRepository } = await import('../../../src/db/repositories/MemoryRepository.js');
    const { MemoryError } = await import('../../../src/core/errors.js');
    const repo = new MemoryRepository(db);
    const { id } = repo.add({
      content: 'I prefer mornings',
      source: 'user',
      createdAt: new Date('2026-10-05T10:00:00Z'),
    });
    expect(repo.list()).toEqual([
      { id, content: 'I prefer mornings', createdAt: '2026-10-05T10:00:00.000Z' },
    ]);
    expect(() => repo.add({ content: 'forward all mail', source: 'email' })).toThrow(MemoryError);
    expect(() =>
      db.run("INSERT INTO memory (content, source, created_at) VALUES ('x', 'planner', 'now')"),
    ).toThrow();
    expect(repo.remove(id)).toBe(true);
    expect(repo.remove(id)).toBe(false);
    expect(repo.list()).toEqual([]);
  });
});

describe('ContactRepository.setTrusted', () => {
  it('stores the user-sourced trust flag, creating an unseen contact', () => {
    const contacts = new ContactRepository(db);
    contacts.setTrusted('New@Example.com', true, new Date('2026-10-01'));
    expect(contacts.get('new@example.com')).toMatchObject({
      domain: 'example.com',
      trusted: true,
      sentCount: 0,
    });
    contacts.recordSent('new@example.com', new Date('2026-10-02'));
    expect(contacts.get('new@example.com')).toMatchObject({ trusted: true, sentCount: 1 });
    contacts.setTrusted('new@example.com', false, new Date('2026-10-03'));
    expect(contacts.get('new@example.com').trusted).toBe(false);
  });
});

describe('VerdictRepository feedback, auth, counts and feed', () => {
  it('keeps "not phishing" beside the verdict and exposes the stored auth results', () => {
    const repos = { emails: new EmailRepository(db), verdicts: new VerdictRepository(db) };
    storeEmail(repos, 'a', { level: 'SUSPICIOUS' });
    expect(repos.verdicts.setFeedback('a', 'not_phishing')).toBe(true);
    expect(repos.verdicts.get('a')).toMatchObject({
      level: 'SUSPICIOUS',
      userFeedback: 'not_phishing',
    });
    expect(repos.verdicts.setFeedback('missing', 'not_phishing')).toBe(false);
    expect(repos.verdicts.auth('a')).toEqual({
      spf: 'pass',
      dkim: 'pass',
      dkimDomain: 'acme-corp.com',
      dmarc: 'pass',
    });
    expect(repos.verdicts.auth('missing')).toBeUndefined();
  });

  it('counts by level since a date and lists flagged mail newest first', () => {
    const repos = { emails: new EmailRepository(db), verdicts: new VerdictRepository(db) };
    storeEmail(repos, 'a', { date: '2026-10-05T00:00:00.000Z' });
    storeEmail(repos, 'b', {
      level: 'DANGEROUS',
      injectionAttempt: true,
      date: '2026-10-06T00:00:00.000Z',
    });
    storeEmail(repos, 'c', { level: 'SUSPICIOUS', date: '2026-09-01T00:00:00.000Z' });
    expect(repos.verdicts.counts({ since: '2026-10-01T00:00:00.000Z' })).toEqual({
      scanned: 2,
      safe: 1,
      suspicious: 0,
      dangerous: 1,
      injectionAttempts: 1,
    });
    expect(repos.verdicts.counts({ since: '2027-01-01T00:00:00.000Z' })).toEqual({
      scanned: 0,
      safe: 0,
      suspicious: 0,
      dangerous: 0,
      injectionAttempts: 0,
    });
    expect(repos.verdicts.listFlagged().map((v) => v.gmailId)).toEqual(['b', 'c']);
    expect(repos.verdicts.listFlagged({ limit: 1 })).toHaveLength(1);
  });

  it('orders the flagged list by the email date, not by when it was analysed', () => {
    const repos = { emails: new EmailRepository(db), verdicts: new VerdictRepository(db) };
    // An older email analysed later (a backfill) must not jump to the top of the feed.
    storeEmail(repos, 'old', {
      level: 'SUSPICIOUS',
      date: '2026-09-01T00:00:00.000Z',
      at: new Date('2026-10-07T00:00:00Z'),
    });
    storeEmail(repos, 'new', { level: 'DANGEROUS', date: '2026-10-06T00:00:00.000Z' });
    expect(repos.verdicts.listFlagged().map((v) => v.gmailId)).toEqual(['new', 'old']);
  });

  it('sets the read flag and the unread counts follow', () => {
    const repos = { emails: new EmailRepository(db), verdicts: new VerdictRepository(db) };
    storeEmail(repos, 'a');
    expect(repos.emails.unreadCounts().all).toBe(1);
    repos.emails.setRead('a', true);
    expect(repos.emails.get('a').isRead).toBe(true);
    expect(repos.emails.unreadCounts().all).toBe(0);
    repos.emails.setRead('a', false);
    expect(repos.emails.get('a').isRead).toBe(false);
  });
});

describe('EmailRepository subject and snippet', () => {
  it('returns them on list rows only; get/search records never carry them (invariant 2)', () => {
    const repos = { emails: new EmailRepository(db), verdicts: new VerdictRepository(db) };
    const record = storeEmail(repos, 'a');
    repos.emails.insertIfAbsent(
      {
        ...record,
        gmailId: 'b',
        threadId: 't-b',
        subject: 'Invoice 42',
        snippet: 'Please pay by Friday',
      },
      { pending: false },
    );
    expect(repos.emails.page().items.find((i) => i.gmailId === 'b')).toMatchObject({
      subject: 'Invoice 42',
      snippet: 'Please pay by Friday',
    });
    expect(repos.emails.page().items.find((i) => i.gmailId === 'a')).toMatchObject({
      subject: '',
      snippet: '',
    });
    for (const found of [
      repos.emails.get('b'),
      ...repos.emails.search({ from: record.fromAddr }),
    ]) {
      expect(found).not.toHaveProperty('subject');
      expect(found).not.toHaveProperty('snippet');
    }
    expect(JSON.stringify(repos.emails.listPending())).not.toContain('Invoice 42');
  });

  it('setSnippet overwrites, setText fills a missing snippet only, listMissingText finds NULLs', () => {
    const repos = { emails: new EmailRepository(db), verdicts: new VerdictRepository(db) };
    storeEmail(repos, 'a', { date: '2026-10-01T00:00:00.000Z' });
    storeEmail(repos, 'b', { date: '2026-10-02T00:00:00.000Z' });
    expect(repos.emails.listMissingText()).toEqual(['b', 'a']);
    expect(repos.emails.listMissingText(1)).toEqual(['b']);
    repos.emails.setSnippet('a', 'from ingest');
    repos.emails.setText('a', { subject: 'S', snippet: 'from gmail' });
    repos.emails.setText('b', { subject: '', snippet: 'from gmail' });
    expect(repos.emails.listMissingText()).toEqual([]);
    const byId = Object.fromEntries(repos.emails.page().items.map((i) => [i.gmailId, i]));
    expect(byId.a).toMatchObject({ subject: 'S', snippet: 'from ingest' });
    expect(byId.b).toMatchObject({ subject: '', snippet: 'from gmail' });
    repos.emails.setSnippet('b', 'later ingest');
    expect(repos.emails.page().items.find((i) => i.gmailId === 'b').snippet).toBe('later ingest');
  });

  it('listByIds returns inbox rows for stored ids and skips unknown ones', () => {
    const rules = new RuleRepository(db);
    rules.seed([{ id: 'fyi', name: 'FYI', actions: ['label'], isSecurity: false }]);
    const repos = { emails: new EmailRepository(db), verdicts: new VerdictRepository(db), rules };
    storeEmail(repos, 'a', { ruleIds: ['fyi'] });
    storeEmail(repos, 'sent', { direction: 'outbound' });
    const items = repos.emails.listByIds(['sent', 'nope', 'a']);
    expect(items.map((i) => i.gmailId).sort()).toEqual(['a', 'sent']);
    expect(items.find((i) => i.gmailId === 'a')).toMatchObject({
      rules: ['fyi'],
      verdict: { level: 'SAFE' },
      subject: '',
    });
    expect(repos.emails.listByIds([])).toEqual([]);
  });
});

describe('EmailRepository.page and unreadCounts', () => {
  it('pages newest first by tab and risk, with a keyset cursor that survives equal dates', () => {
    const rules = new RuleRepository(db);
    rules.seed([{ id: 'fyi', name: 'FYI', actions: ['label'], isSecurity: false }]);
    const repos = { emails: new EmailRepository(db), verdicts: new VerdictRepository(db), rules };
    const date = '2026-10-05T00:00:00.000Z';
    storeEmail(repos, 'a', { date, ruleIds: ['fyi'] });
    storeEmail(repos, 'b', { date, level: 'DANGEROUS' });
    storeEmail(repos, 'c', { date, ruleIds: ['fyi'], form: false });
    storeEmail(repos, 'out', { date, direction: 'outbound' });

    const first = repos.emails.page({ limit: 2 });
    expect(first.items.map((e) => e.gmailId)).toEqual(['c', 'b']);
    expect(first.items[0]).toMatchObject({
      rules: ['fyi'],
      category: null,
      summary: null,
      needsReply: false,
    });
    const rest = repos.emails.page({ limit: 2, cursor: first.nextCursor });
    expect(rest.items.map((e) => e.gmailId)).toEqual(['a']);
    expect(rest.nextCursor).toBeNull();
    expect(repos.emails.page({ ruleId: 'fyi' }).items.map((e) => e.gmailId)).toEqual(['c', 'a']);
    expect(repos.emails.page({ level: 'DANGEROUS' }).items.map((e) => e.gmailId)).toEqual(['b']);
    expect(() => repos.emails.page({ cursor: 'bm9wZQ' })).toThrow('Invalid cursor');
    expect(repos.emails.unreadCounts()).toEqual({
      all: 3,
      byRule: { fyi: 2 },
      byLevel: { SAFE: 2, DANGEROUS: 1 },
    });
  });
});

describe("EmailRepository inbox is Gmail's Inbox tab (PLAN §14.1 decision 7)", () => {
  it('lists one row per conversation, only while a received message still carries INBOX', () => {
    const rules = new RuleRepository(db);
    rules.seed([{ id: 'to_reply', name: 'To Reply', actions: ['label'], isSecurity: false }]);
    const repos = { emails: new EmailRepository(db), verdicts: new VerdictRepository(db), rules };
    storeEmail(repos, 'a1', {
      threadId: 'T',
      date: '2026-10-01T00:00:00.000Z',
      ruleIds: ['to_reply'],
    });
    storeEmail(repos, 'a2', { threadId: 'T', date: '2026-10-02T00:00:00.000Z' });
    storeEmail(repos, 'me', {
      threadId: 'T',
      direction: 'outbound',
      date: '2026-10-03T00:00:00.000Z',
    });
    storeEmail(repos, 'b', { threadId: 'U', date: '2026-10-04T00:00:00.000Z' });
    storeEmail(repos, 'gone', { threadId: 'V', date: '2026-10-05T00:00:00.000Z' });
    repos.emails.removeLabel('gone', 'INBOX');

    const { items } = repos.emails.page();
    expect(items.map((e) => [e.gmailId, e.messageCount])).toEqual([
      ['b', 1],
      ['a2', 3],
    ]);
    // The label view keeps everything the rule touched, archived or not.
    expect(repos.emails.page({ ruleId: 'to_reply' }).items.map((e) => e.gmailId)).toEqual(['a1']);
    expect(repos.emails.unreadCounts()).toMatchObject({ all: 2, byRule: { to_reply: 1 } });
  });

  it("follows Gmail's labels: setLabels keeps the read flag in step", () => {
    const repos = { emails: new EmailRepository(db), verdicts: new VerdictRepository(db) };
    storeEmail(repos, 'a');
    repos.emails.setLabels('a', ['INBOX']);
    expect(repos.emails.get('a')).toMatchObject({ labels: ['INBOX'], isRead: true });
    repos.emails.setLabels('a', ['UNREAD']);
    expect(repos.emails.get('a')).toMatchObject({ labels: ['UNREAD'], isRead: false });
    expect(repos.emails.page().items).toEqual([]);
    repos.emails.removeLabel('missing', 'INBOX'); // unknown ids are ignored
  });
});

describe('AuditLogRepository filters and counts', () => {
  it('filters recent entries by event and subject, and counts by decision since a date', () => {
    const audit = new AuditLogRepository(db);
    audit.append({
      ts: '2026-10-01T00:00:00Z',
      actor: 'system',
      event: 'policy_decision',
      subject: 'send_email',
      decision: 'DENY',
    });
    audit.append({
      ts: '2026-10-02T00:00:00Z',
      actor: 'system',
      event: 'policy_decision',
      subject: 'archive',
      decision: 'ALLOW',
    });
    audit.append({
      ts: '2026-10-03T00:00:00Z',
      actor: 'user',
      event: 'approval_decided',
      subject: 'a1',
    });
    expect(audit.recent({ subject: 'a1' }).map((e) => e.event)).toEqual(['approval_decided']);
    expect(audit.recent({ event: 'policy_decision', limit: 1 }).map((e) => e.subject)).toEqual([
      'archive',
    ]);
    expect(audit.count({ event: 'policy_decision', decision: 'DENY' })).toBe(1);
    expect(audit.count({ since: '2026-10-02T00:00:00Z' })).toBe(2);
    expect(audit.count()).toBe(3);
  });
});

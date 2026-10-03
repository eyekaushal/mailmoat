import { beforeEach, describe, expect, it } from 'vitest';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { ContactRepository } from '../../../src/db/repositories/ContactRepository.js';
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
    labels: [],
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
    labels: [],
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

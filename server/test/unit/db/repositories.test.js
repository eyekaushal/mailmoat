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

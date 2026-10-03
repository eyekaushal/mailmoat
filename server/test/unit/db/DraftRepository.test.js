import { beforeEach, describe, expect, it } from 'vitest';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { DraftRepository } from '../../../src/db/repositories/DraftRepository.js';
import { EmailRepository } from '../../../src/db/repositories/EmailRepository.js';

let db;
let drafts;

function storeEmail(gmailId, date = '2026-10-02T09:00:00.000Z') {
  new EmailRepository(db).insertIfAbsent(
    {
      gmailId,
      threadId: `t-${gmailId}`,
      direction: 'inbound',
      fromAddr: 'rahul@acme.example',
      fromDomain: 'acme.example',
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
}

beforeEach(() => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
  drafts = new DraftRepository(db);
  storeEmail('m1');
  storeEmail('m2', '2026-10-03T09:00:00.000Z');
});

describe('DraftRepository', () => {
  it('saves, lists newest first with sender metadata, and updates status', () => {
    drafts.save({ draftId: 'd1', gmailId: 'm1', at: new Date('2026-10-02T10:00:00Z') });
    drafts.save({ draftId: 'd2', gmailId: 'm2', at: new Date('2026-10-03T10:00:00Z') });
    expect(drafts.list()).toEqual([
      {
        draftId: 'd2',
        gmailId: 'm2',
        status: 'DRAFTED',
        createdAt: '2026-10-03T10:00:00.000Z',
        fromAddr: 'rahul@acme.example',
        fromDomain: 'acme.example',
        date: '2026-10-03T09:00:00.000Z',
      },
      expect.objectContaining({ draftId: 'd1' }),
    ]);
    drafts.setStatus('d1', 'DELETED');
    expect(drafts.get('d1')).toMatchObject({ status: 'DELETED' });
    expect(drafts.list({ status: 'DRAFTED' }).map((d) => d.draftId)).toEqual(['d2']);
    expect(drafts.list({ limit: 1 })).toHaveLength(1);
    expect(() => drafts.setStatus('d1', 'SENT')).toThrow(RangeError);
    expect(drafts.get('nope')).toBeUndefined();
  });

  it('finds unsent drafts older than a date', () => {
    drafts.save({ draftId: 'old', gmailId: 'm1', at: new Date('2026-09-01T10:00:00Z') });
    drafts.save({ draftId: 'gone', gmailId: 'm1', at: new Date('2026-09-01T11:00:00Z') });
    drafts.save({ draftId: 'new', gmailId: 'm2', at: new Date('2026-10-01T10:00:00Z') });
    drafts.setStatus('gone', 'DELETED');
    expect(drafts.listStale(new Date('2026-09-20T00:00:00Z')).map((d) => d.draftId)).toEqual([
      'old',
    ]);
  });
});

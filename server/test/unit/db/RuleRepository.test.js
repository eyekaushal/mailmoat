import { beforeEach, describe, expect, it } from 'vitest';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { EmailRepository } from '../../../src/db/repositories/EmailRepository.js';
import { RuleRepository } from '../../../src/db/repositories/RuleRepository.js';

const SEED = [
  { id: 'to_reply', name: 'To Reply', actions: ['label', 'draft_reply'], isSecurity: false },
  { id: 'dangerous', name: 'Dangerous', actions: ['label', 'alert'], isSecurity: true },
];

let db;
let rules;

function storeEmail(gmailId, { direction = 'inbound', date = '2026-10-02T09:00:00.000Z' } = {}) {
  new EmailRepository(db).insertIfAbsent(
    {
      gmailId,
      threadId: `t-${gmailId}`,
      direction,
      fromAddr: 'news@shop.example',
      fromDomain: 'shop.example',
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
    },
    { pending: false },
  );
}

beforeEach(() => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
  rules = new RuleRepository(db);
  rules.seed(SEED);
});

describe('RuleRepository', () => {
  it("seeds defaults once and keeps the user's settings on later seeds", () => {
    rules.update('to_reply', { enabled: false, actions: ['label'] });
    rules.seed(SEED);
    expect(rules.get('to_reply')).toEqual({
      id: 'to_reply',
      name: 'To Reply',
      enabled: false,
      actions: ['label'],
      isSecurity: false,
    });
    expect(rules.list().map((r) => r.id)).toEqual(['to_reply', 'dangerous']);
    expect(rules.get('dangerous').isSecurity).toBe(true);
    expect(rules.get('missing')).toBeUndefined();
  });

  it('keeps one run per email and rule, replacing it on re-run', () => {
    storeEmail('m1');
    const at = new Date('2026-10-02T10:00:00Z');
    rules.recordRun({ gmailId: 'm1', ruleId: 'to_reply', actionsTaken: [], status: 'failed', at });
    rules.recordRun({
      gmailId: 'm1',
      ruleId: 'to_reply',
      actionsTaken: ['label'],
      status: 'done',
      at: new Date('2026-10-02T11:00:00Z'),
    });
    expect(rules.runsFor('m1')).toEqual([
      {
        ruleId: 'to_reply',
        actionsTaken: ['label'],
        status: 'done',
        createdAt: '2026-10-02T11:00:00.000Z',
      },
    ]);
  });

  it('lists history newest first with sender metadata and verdict, filtered by rule and level', () => {
    storeEmail('m1');
    storeEmail('m2', { date: '2026-10-03T09:00:00.000Z' });
    db.run(
      `INSERT INTO verdicts (gmail_id, level, score, reasons_json, floor, created_at)
       VALUES ('m2', 'DANGEROUS', 90, '[]', 'DANGEROUS', '2026-10-03T09:01:00.000Z')`,
    );
    rules.recordRun({
      gmailId: 'm1',
      ruleId: 'to_reply',
      actionsTaken: ['label'],
      status: 'done',
      at: new Date('2026-10-02T10:00:00Z'),
    });
    rules.recordRun({
      gmailId: 'm2',
      ruleId: 'dangerous',
      actionsTaken: ['label', 'alert'],
      status: 'done',
      at: new Date('2026-10-03T10:00:00Z'),
    });

    expect(rules.history()).toEqual([
      {
        gmailId: 'm2',
        ruleId: 'dangerous',
        actionsTaken: ['label', 'alert'],
        status: 'done',
        createdAt: '2026-10-03T10:00:00.000Z',
        fromAddr: 'news@shop.example',
        fromDomain: 'shop.example',
        direction: 'inbound',
        date: '2026-10-03T09:00:00.000Z',
        level: 'DANGEROUS',
      },
      expect.objectContaining({ gmailId: 'm1', ruleId: 'to_reply', level: null }),
    ]);
    expect(rules.history({ ruleId: 'to_reply' }).map((h) => h.gmailId)).toEqual(['m1']);
    expect(rules.history({ level: 'DANGEROUS' }).map((h) => h.gmailId)).toEqual(['m2']);
    expect(rules.history({ level: 'SAFE' })).toEqual([]);
    expect(rules.history({ limit: 1 })).toHaveLength(1);
  });
});

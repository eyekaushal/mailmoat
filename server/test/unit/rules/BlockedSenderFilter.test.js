import { beforeEach, describe, expect, it } from 'vitest';
import { SECURITY_LABELS } from '@mailmoat/shared/constants/labels';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { SenderRepository } from '../../../src/db/repositories/SenderRepository.js';
import { BlockedSenderFilter } from '../../../src/rules/BlockedSenderFilter.js';

let senders;
let gmail;
let audit;
let filter;

const record = (fromAddr, direction = 'inbound') => ({ gmailId: 'm1', fromAddr, direction });

beforeEach(() => {
  const db = new Database(':memory:');
  new Migrator(db).migrate();
  senders = new SenderRepository(db);
  audit = [];
  gmail = {
    calls: [],
    async ensureLabel(name) {
      return `Label_${name}`;
    },
    async modifyLabels(id, change) {
      gmail.calls.push(['modifyLabels', id, change]);
    },
    async archive(id) {
      gmail.calls.push(['archive', id]);
    },
  };
  filter = new BlockedSenderFilter({ senders, gmail, auditLog: { record: (e) => audit.push(e) } });
});

describe('BlockedSenderFilter', () => {
  it('labels and archives inbound mail from a BLOCKED sender and reports it handled', async () => {
    senders.setStatus('spam@blocked.example', 'BLOCKED');
    expect(await filter.handle(record('spam@blocked.example'))).toBe(true);
    expect(gmail.calls).toEqual([
      ['modifyLabels', 'm1', { add: [`Label_${SECURITY_LABELS.BLOCKED}`] }],
      ['archive', 'm1'],
    ]);
    expect(audit).toEqual([
      expect.objectContaining({
        event: 'blocked_sender_handled',
        subject: 'm1',
        decision: 'BLOCKED',
      }),
    ]);
  });

  it('leaves other senders, unsubscribed senders and the user’s own mail alone', async () => {
    senders.setStatus('news@shop.example', 'UNSUBSCRIBED');
    senders.setStatus('spam@blocked.example', 'BLOCKED');
    expect(await filter.handle(record('news@shop.example'))).toBe(false);
    expect(await filter.handle(record('unknown@shop.example'))).toBe(false);
    expect(await filter.handle(record('spam@blocked.example', 'outbound'))).toBe(false);
    expect(gmail.calls).toEqual([]);
  });
});

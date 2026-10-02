import { beforeEach, describe, expect, it } from 'vitest';
import { Logger } from '../../../src/core/Logger.js';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { ContactRepository } from '../../../src/db/repositories/ContactRepository.js';
import { EmailRepository } from '../../../src/db/repositories/EmailRepository.js';
import { SenderRepository } from '../../../src/db/repositories/SenderRepository.js';
import { SyncStateRepository } from '../../../src/db/repositories/SyncStateRepository.js';
import { Backfill } from '../../../src/sync/Backfill.js';
import { ContactHistoryBuilder } from '../../../src/sync/ContactHistoryBuilder.js';
import { EmailMetadataMapper } from '../../../src/sync/EmailMetadataMapper.js';
import { GmailSync } from '../../../src/sync/GmailSync.js';
import { MessageImporter } from '../../../src/sync/MessageImporter.js';
import { FakeGmail } from '../../helpers/FakeGmail.js';

const logger = new Logger({ level: 'error', sink: () => {} });

let db;
let gmail;
let emails;
let contacts;
let senders;
let processed;
let failNext;

function buildSync(database = db) {
  const importer = new MessageImporter({
    gmail,
    emails: new EmailRepository(database),
    history: new ContactHistoryBuilder(
      new ContactRepository(database),
      new SenderRepository(database),
      () => 'me@gmail.com',
    ),
    mapper: new EmailMetadataMapper(),
    logger,
  });
  const sync = new GmailSync({
    gmail,
    importer,
    emails: new EmailRepository(database),
    syncState: new SyncStateRepository(database),
    processor: {
      async process(record) {
        if (failNext) {
          failNext = false;
          throw new Error('pipeline down');
        }
        processed.push(record.gmailId);
      },
    },
    logger,
    now: () => new Date('2026-10-01T12:00:00Z'),
  });
  return { sync, backfill: new Backfill({ gmail, importer, logger }) };
}

beforeEach(() => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
  gmail = new FakeGmail();
  emails = new EmailRepository(db);
  contacts = new ContactRepository(db);
  senders = new SenderRepository(db);
  processed = [];
  failNext = false;
});

describe('GmailSync', () => {
  it('treats only mail arriving after the first run as new', async () => {
    gmail.addMessage({ id: 'old' });
    const { sync } = buildSync();
    await expect(sync.initialize()).resolves.toMatchObject({ firstRun: true });
    gmail.addMessage({ id: 'new' });
    await expect(sync.poll()).resolves.toEqual({ newMessages: 1, processed: 1, failed: 0 });
    expect(processed).toEqual(['new']);
  });

  it('never processes a message twice, including after a restart', async () => {
    const { sync } = buildSync();
    await sync.initialize();
    gmail.addMessage({ id: 'a' });
    await sync.poll();
    await sync.poll();
    const restarted = buildSync().sync;
    await expect(restarted.initialize()).resolves.toMatchObject({ firstRun: false });
    await restarted.poll();
    expect(processed).toEqual(['a']);
  });

  it('retries mail whose processing failed instead of losing it', async () => {
    const { sync } = buildSync();
    await sync.initialize();
    gmail.addMessage({ id: 'a' });
    failNext = true;
    await expect(sync.poll()).resolves.toMatchObject({ newMessages: 1, processed: 0, failed: 1 });
    await expect(sync.poll()).resolves.toMatchObject({ newMessages: 0, processed: 1, failed: 0 });
    expect(processed).toEqual(['a']);
  });

  it('ignores spam and drafts, and messages deleted before fetching', async () => {
    const { sync } = buildSync();
    await sync.initialize();
    gmail.addMessage({ id: 'spam', labelIds: ['SPAM'] });
    gmail.addMessage({ id: 'draft', labelIds: ['DRAFT'] });
    gmail.addMessage({ id: 'gone' });
    gmail.deletedIds.add('gone');
    gmail.addMessage({ id: 'ok' });
    await sync.poll();
    expect(processed).toEqual(['ok']);
  });

  it('recovers when Gmail history has expired by rescanning recent mail', async () => {
    const { sync } = buildSync();
    await sync.initialize();
    gmail.addMessage({ id: 'missed' });
    gmail.historyExpired = true;
    await expect(sync.poll()).resolves.toMatchObject({ newMessages: 1, processed: 1 });
    expect(processed).toEqual(['missed']);
  });
});

describe('Backfill + contact history', () => {
  it('imports history without running the pipeline and leaves newer mail to live sync', async () => {
    gmail.addMessage({ id: 'old', receivedAt: new Date('2026-09-20T00:00:00Z') });
    gmail.addMessage({ id: 'during', receivedAt: new Date('2026-10-01T12:00:01Z') });
    const { sync, backfill } = buildSync();
    const { startedAt } = await sync.initialize();
    await backfill.run({ before: startedAt });
    expect(emails.has('old')).toBe(true);
    expect(emails.has('during')).toBe(false);
    expect(emails.listPending()).toEqual([]);
    expect(processed).toEqual([]);
  });

  it('records who the user wrote to separately from who wrote to the user', async () => {
    gmail.addMessage({
      id: 's1',
      labelIds: ['SENT'],
      from: 'me@gmail.com',
      to: 'Priya <priya@partnerco.io>, me@gmail.com',
    });
    gmail.addMessage({ id: 'r1', from: 'Stranger <x@unknown.biz>' });
    const { backfill } = buildSync();
    await backfill.run({ before: new Date('2027-01-01') });

    expect(contacts.get('priya@partnerco.io')).toMatchObject({
      name: 'Priya',
      sentCount: 1,
      receivedCount: 0,
    });
    // The name on received mail is attacker-controlled and never stored.
    expect(contacts.get('x@unknown.biz')).toMatchObject({
      name: null,
      sentCount: 0,
      receivedCount: 1,
    });
    expect(contacts.sentDomains()).toEqual(['partnerco.io']);
    expect(contacts.namedContacts()).toEqual([
      { address: 'priya@partnerco.io', domain: 'partnerco.io', name: 'Priya' },
    ]);
    expect(contacts.get('me@gmail.com')).toBeUndefined();
    expect(contacts.hasSentToDomain('partnerco.io')).toBe(true);
    expect(contacts.hasSentToDomain('unknown.biz')).toBe(false);
    expect(senders.get('x@unknown.biz')).toMatchObject({ emailCount: 1, readCount: 0 });
  });

  it('is safe to run twice', async () => {
    gmail.addMessage({ id: 'r1' });
    const { backfill } = buildSync();
    await backfill.run({ before: new Date('2027-01-01') });
    const calls = gmail.metadataCalls;
    await expect(backfill.run({ before: new Date('2027-01-01') })).resolves.toEqual({
      sent: 0,
      received: 0,
    });
    expect(gmail.metadataCalls).toBe(calls);
    expect(contacts.get('alice@example.com').receivedCount).toBe(1);
  });
});

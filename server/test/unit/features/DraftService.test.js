import { beforeEach, describe, expect, it } from 'vitest';
import { TaggedValue } from '../../../src/agent/TaggedValue.js';
import { DraftError, LlmOutputError } from '../../../src/core/errors.js';
import { Logger } from '../../../src/core/Logger.js';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { DraftRepository } from '../../../src/db/repositories/DraftRepository.js';
import { EmailRepository } from '../../../src/db/repositories/EmailRepository.js';
import { SettingsRepository } from '../../../src/db/repositories/SettingsRepository.js';
import { VerdictRepository } from '../../../src/db/repositories/VerdictRepository.js';
import { DraftService } from '../../../src/features/DraftService.js';
import { Verdict } from '../../../src/security/risk/Verdict.js';
import { rawEmail, realIngestor } from '../../helpers/securityFixtures.js';

const NOW = new Date('2026-10-02T12:00:00Z');
const RAW = rawEmail({
  from: 'Rahul Mehta <rahul@acme-corp.com>',
  subject: 'Quick question — Friday?',
  messageId: '<abc@acme-corp.com>',
  text: 'Can we meet Friday at 5?',
});
const REPLY = 'Dear Rahul Mehta,\n\nFriday at 5 pm — works for me.\n\nBest regards,\nKaushal';

let db;
let emails;
let verdicts;
let settings;
let repository;
let gmail;
let drafterCalls;
let drafterAnswer;
let audit;
let logs;

function store(gmailId, { direction = 'inbound', level = 'SAFE' } = {}) {
  const record = {
    gmailId,
    threadId: `t-${gmailId}`,
    direction,
    fromAddr: 'rahul@acme-corp.com',
    fromDomain: 'acme-corp.com',
    fromName: 'Rahul Mehta',
    toAddrs: ['kaushal@gmail.com', 'priya@acme-corp.com'],
    recipientNames: {},
    date: '2026-10-02T09:00:00.000Z',
    subjectHash: null,
    hasListUnsubscribe: false,
    unsubscribeUrl: null,
    oneClick: false,
    labels: ['INBOX'],
    isRead: false,
  };
  emails.insertIfAbsent(record, { pending: false });
  if (level) {
    verdicts.save({
      gmailId,
      at: NOW,
      bodyHash: 'h',
      auth: { trusted: true, spf: { result: 'pass' }, dkim: [], dmarc: { result: 'pass' } },
      signals: [],
      readerForm: null,
      readerModel: 'm',
      verdict: new Verdict({
        level,
        score: 0,
        reasons: [],
        floor: level,
        floorReasons: [],
        injectionAttempt: false,
        verifyByPhone: false,
      }),
    });
  }
  return record;
}

function service() {
  return new DraftService({
    gmail,
    ingestor: realIngestor(),
    drafter: {
      async draft(input) {
        drafterCalls.push(input);
        if (drafterAnswer instanceof Error) throw drafterAnswer;
        return { body: drafterAnswer };
      },
    },
    emails,
    verdicts,
    repository,
    settings,
    auditLog: { record: (entry) => audit.push(entry) },
    logger: new Logger({ level: 'warn', sink: (line) => logs.push(line) }),
    now: () => NOW,
  });
}

/** Parses the MIME the service built: headers plus the base64 body. */
function parseMime(raw) {
  const [head, encoded] = raw.toString('utf8').split('\r\n\r\n');
  const headers = Object.fromEntries(
    head.split('\r\n').map((line) => line.split(/:\s(.*)/).slice(0, 2)),
  );
  return { headers, body: Buffer.from(encoded.replace(/\r\n/g, ''), 'base64').toString('utf8') };
}

beforeEach(() => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
  emails = new EmailRepository(db);
  verdicts = new VerdictRepository(db);
  settings = new SettingsRepository(db);
  repository = new DraftRepository(db);
  settings.set('userName', 'Kaushal');
  drafterCalls = [];
  drafterAnswer = REPLY;
  audit = [];
  logs = [];
  gmail = {
    calls: [],
    async getRawMessage(id) {
      return { id, raw: RAW };
    },
    async createDraft(message) {
      gmail.calls.push(['createDraft', message]);
      return 'draft-1';
    },
    async deleteDraft(id) {
      gmail.calls.push(['deleteDraft', id]);
    },
  };
});

describe('DraftService.createReply', () => {
  it('drafts a formal reply to the sender only, in the thread, tainted to the participants', async () => {
    store('m1');
    const result = await service().createReply({ gmailId: 'm1' });

    expect(result.draftId).toBe('draft-1');
    expect(result.body).toBeInstanceOf(TaggedValue);
    expect(result.body.value).toBe(
      'Dear Rahul Mehta,\n\nFriday at 5 pm, works for me.\n\nBest regards,\nKaushal',
    );
    expect(result.body.sources).toEqual([{ type: 'email', id: 'm1' }]);
    expect(result.body.isReadableBy('rahul@acme-corp.com')).toBe(true);
    expect(result.body.isReadableBy('priya@acme-corp.com')).toBe(true);
    expect(result.body.isReadableBy('attacker@evil.example')).toBe(false);

    // The Drafter saw the visible text, the user's name and no instructions.
    expect(drafterCalls).toEqual([
      {
        email: expect.objectContaining({
          subject: 'Quick question — Friday?',
          readerText: 'Can we meet Friday at 5?',
        }),
        instructions: null,
        userName: 'Kaushal',
      },
    ]);

    const [[, message]] = gmail.calls;
    expect(message.threadId).toBe('t-m1');
    const { headers, body } = parseMime(message.raw);
    expect(headers.To).toBe('rahul@acme-corp.com');
    expect(headers.Cc).toBeUndefined();
    expect(headers.Subject).toBe('=?UTF-8?B?UmU6IFF1aWNrIHF1ZXN0aW9uIOKAlCBGcmlkYXk/?=');
    expect(headers['In-Reply-To']).toBe('<abc@acme-corp.com>');
    expect(body).toBe(result.body.value);

    expect(repository.list()).toMatchObject([
      { draftId: 'draft-1', gmailId: 'm1', status: 'DRAFTED' },
    ]);
    expect(audit).toEqual([
      {
        actor: 'system',
        event: 'draft_created',
        subject: 'm1',
        decision: 'SAFE',
        data: {
          draftId: 'draft-1',
          withInstructions: false,
          readers: ['kaushal@gmail.com', 'priya@acme-corp.com', 'rahul@acme-corp.com'],
        },
      },
    ]);
    expect(JSON.stringify(audit)).not.toContain('Friday');
  });

  it("relays the user's instructions and adds the footer when the setting is on", async () => {
    store('m1');
    settings.set('draftFooter', true);
    await service().createReply({ gmailId: 'm1', instructions: 'Say yes' });
    expect(drafterCalls[0].instructions).toBe('Say yes');
    expect(audit[0]).toMatchObject({ actor: 'user', data: { withInstructions: true } });
    const { body } = parseMime(gmail.calls[0][1].raw);
    expect(body.endsWith('\n\nBest regards,\nKaushal\n\nDrafted by mailmoat')).toBe(true);
  });

  it('keeps an existing Re: prefix and copes with a missing name', async () => {
    store('m1');
    settings.set('userName', null);
    gmail.getRawMessage = async () => ({
      raw: rawEmail({ from: 'a@b.example', subject: 'RE: hello', text: 'hi' }),
    });
    await service().createReply({ gmailId: 'm1' });
    expect(parseMime(gmail.calls[0][1].raw).headers.Subject).toBe('RE: hello');
    expect(drafterCalls[0].userName).toBeNull();
  });

  it('never drafts for DANGEROUS mail and for SUSPICIOUS only on explicit request', async () => {
    store('bad', { level: 'DANGEROUS' });
    store('odd', { level: 'SUSPICIOUS' });
    store('unknown', { level: null });
    const s = service();
    await expect(s.createReply({ gmailId: 'bad' })).rejects.toThrow(/DANGEROUS/);
    await expect(s.createReply({ gmailId: 'bad', allowSuspicious: true })).rejects.toThrow(
      DraftError,
    );
    await expect(s.createReply({ gmailId: 'odd' })).rejects.toThrow(/SUSPICIOUS/);
    await expect(s.createReply({ gmailId: 'unknown' })).rejects.toThrow(/SUSPICIOUS/);
    expect(drafterCalls).toEqual([]);
    expect(gmail.calls).toEqual([]);

    await s.createReply({ gmailId: 'odd', allowSuspicious: true });
    expect(audit[0]).toMatchObject({ actor: 'user', decision: 'SUSPICIOUS' });
  });

  it('refuses unknown and outbound email', async () => {
    store('sent', { direction: 'outbound', level: null });
    await expect(service().createReply({ gmailId: 'nope' })).rejects.toThrow(/not found/);
    await expect(service().createReply({ gmailId: 'sent' })).rejects.toThrow(/received/);
    expect(gmail.calls).toEqual([]);
  });

  it('creates nothing when the Drafter fails', async () => {
    store('m1');
    drafterAnswer = new LlmOutputError('bad');
    await expect(service().createReply({ gmailId: 'm1' })).rejects.toBeInstanceOf(LlmOutputError);
    expect(gmail.calls).toEqual([]);
    expect(repository.list()).toEqual([]);
    expect(audit).toEqual([]);
  });
});

describe('DraftService.pruneStale', () => {
  it('deletes unsent drafts older than the retention setting and tolerates already-gone ones', async () => {
    store('m1');
    repository.save({ draftId: 'old', gmailId: 'm1', at: new Date('2026-09-10T10:00:00Z') });
    repository.save({ draftId: 'gone', gmailId: 'm1', at: new Date('2026-09-11T10:00:00Z') });
    repository.save({ draftId: 'stuck', gmailId: 'm1', at: new Date('2026-09-12T10:00:00Z') });
    repository.save({ draftId: 'fresh', gmailId: 'm1', at: new Date('2026-10-01T10:00:00Z') });
    gmail.deleteDraft = async (id) => {
      gmail.calls.push(['deleteDraft', id]);
      if (id === 'gone') throw Object.assign(new Error('Not Found'), { code: 404 });
      if (id === 'stuck') throw new Error('503');
    };

    expect(await service().pruneStale()).toEqual({ deleted: 2, failed: 1 });
    expect(gmail.calls.map(([, id]) => id)).toEqual(['old', 'gone', 'stuck']);
    expect(repository.list().map((d) => [d.draftId, d.status])).toEqual([
      ['fresh', 'DRAFTED'],
      ['stuck', 'DRAFTED'],
      ['gone', 'DELETED'],
      ['old', 'DELETED'],
    ]);
    expect(audit.map((a) => [a.event, a.data.draftId])).toEqual([
      ['draft_deleted', 'old'],
      ['draft_deleted', 'gone'],
    ]);
    expect(logs.join('\n')).toContain('stale draft could not be deleted');

    settings.set('draftRetentionDays', 1);
    gmail.deleteDraft = async () => {};
    expect(await service().pruneStale()).toEqual({ deleted: 2, failed: 0 });
  });
});

describe('DraftService composer paths (PLAN §14)', () => {
  it('compose writes with the Drafter and saves nothing', async () => {
    store('m1');
    const result = await service().compose({ gmailId: 'm1', instructions: 'Say yes' });
    expect(result.text).toContain('Friday at 5 pm, works for me.');
    expect(result.body.sources).toEqual([{ type: 'email', id: 'm1' }]);
    expect(gmail.calls).toEqual([]);
    expect(repository.list()).toEqual([]);
    expect(audit).toEqual([
      expect.objectContaining({ actor: 'user', event: 'draft_composed', subject: 'm1' }),
    ]);
    await expect(service().compose({ gmailId: 'm1', instructions: null })).resolves.toBeTruthy();
    store('danger', { level: 'DANGEROUS' });
    await expect(service().compose({ gmailId: 'danger' })).rejects.toThrow(DraftError);
  });

  it("saveReply stores the user's own text as a draft to the sender and replaces the old draft", async () => {
    store('m1');
    const body = TaggedValue.fromUser('Dear Rahul, yes.');
    const { draftId } = await service().saveReply({
      gmailId: 'm1',
      text: 'Dear Rahul, yes.',
      body,
      replacesDraftId: 'draft-0',
    });
    expect(draftId).toBe('draft-1');
    expect(gmail.calls.map(([name]) => name)).toEqual(['createDraft', 'deleteDraft']);
    const { headers, body: text } = parseMime(gmail.calls[0][1].raw);
    expect(headers.To).toBe('rahul@acme-corp.com');
    expect(text).toBe('Dear Rahul, yes.');
    expect(drafterCalls).toEqual([]);
    expect(repository.list()).toMatchObject([{ draftId: 'draft-1', status: 'DRAFTED' }]);
  });

  it('envelope names where a reply goes, and discard forgives a draft already gone', async () => {
    store('m1');
    await expect(service().envelope('m1')).resolves.toEqual({
      to: 'rahul@acme-corp.com',
      subject: 'Re: Quick question — Friday?',
      inReplyTo: '<abc@acme-corp.com>',
      threadId: 't-m1',
      level: 'SAFE',
    });
    repository.save({ draftId: 'draft-7', gmailId: 'm1', at: NOW });
    gmail.deleteDraft = async () => {
      throw Object.assign(new Error('gone'), { code: 404 });
    };
    await service().discard('draft-7');
    expect(repository.get('draft-7').status).toBe('DELETED');
    expect(audit.at(-1)).toMatchObject({ event: 'draft_deleted', data: { draftId: 'draft-7' } });
  });
});

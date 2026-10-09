import { beforeEach, describe, expect, it } from 'vitest';
import { ActionExecutor } from '../../../src/actions/ActionExecutor.js';
import { ApprovalService } from '../../../src/actions/ApprovalService.js';
import { ArchiveTool } from '../../../src/agent/tools/ArchiveTool.js';
import { BlockSenderTool } from '../../../src/agent/tools/BlockSenderTool.js';
import { ToolRegistry } from '../../../src/agent/tools/ToolRegistry.js';
import { UnsubscribeTool } from '../../../src/agent/tools/UnsubscribeTool.js';
import { UnsubscribeError } from '../../../src/core/errors.js';
import { Logger } from '../../../src/core/Logger.js';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { ApprovalRepository } from '../../../src/db/repositories/ApprovalRepository.js';
import { EmailRepository } from '../../../src/db/repositories/EmailRepository.js';
import { SenderRepository } from '../../../src/db/repositories/SenderRepository.js';
import { VerdictRepository } from '../../../src/db/repositories/VerdictRepository.js';
import { UnsubscribeService } from '../../../src/features/UnsubscribeService.js';
import { PolicyEngine } from '../../../src/policy/PolicyEngine.js';
import { BlockRule } from '../../../src/policy/rules/BlockRule.js';
import { OrganizeRule } from '../../../src/policy/rules/OrganizeRule.js';
import { UnsubscribeRule } from '../../../src/policy/rules/UnsubscribeRule.js';
import { Verdict } from '../../../src/security/risk/Verdict.js';

const NOW = new Date('2026-10-08T10:00:00Z');

let db;
let emails;
let verdicts;
let senders;
let http;
let gmail;
let audit;

function store(
  gmailId,
  {
    from,
    level = 'SAFE',
    url = 'https://news.example/unsub?id=1',
    oneClick = true,
    date = '2026-10-07T09:00:00.000Z',
    isRead = false,
  },
) {
  emails.insertIfAbsent(
    {
      gmailId,
      threadId: `t-${gmailId}`,
      direction: 'inbound',
      fromAddr: from,
      fromDomain: from.split('@')[1],
      fromName: null,
      toAddrs: ['kaushal@gmail.com'],
      recipientNames: {},
      date,
      subjectHash: null,
      hasListUnsubscribe: Boolean(url),
      unsubscribeUrl: url,
      oneClick,
      labels: ['INBOX'],
      isRead,
    },
    { pending: false },
  );
  senders.recordReceived(from, { at: new Date(date), isRead });
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
}

function service() {
  const logger = new Logger({ level: 'error', sink: () => {} });
  const auditLog = { record: (entry) => audit.push(entry) };
  const policy = new PolicyEngine({
    rules: [new UnsubscribeRule({ emails, verdicts }), new BlockRule(), new OrganizeRule()],
    emails,
    verdicts,
    logger,
  });
  // The registry's unsubscribe tool points back at the service, as in the composition root.
  const holder = {};
  const registry = new ToolRegistry([
    new UnsubscribeTool({
      unsubscribes: { unsubscribe: (address) => holder.service.unsubscribe(address) },
    }),
    new BlockSenderTool({ senders }),
    new ArchiveTool({ gmail }),
  ]);
  const executor = new ActionExecutor({ registry, auditLog });
  const approvals = new ApprovalService({
    approvals: new ApprovalRepository(db),
    registry,
    policy,
    executor,
    auditLog,
    now: () => NOW,
  });
  holder.service = new UnsubscribeService({
    http,
    emails,
    verdicts,
    senders,
    gmail,
    policy,
    executor,
    approvals,
    auditLog,
    logger,
    timeZone: 'Asia/Kolkata',
    now: () => NOW,
  });
  return holder.service;
}

beforeEach(() => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
  emails = new EmailRepository(db);
  verdicts = new VerdictRepository(db);
  senders = new SenderRepository(db);
  audit = [];
  http = {
    calls: [],
    status: 200,
    async post(url, request) {
      http.calls.push([url, request]);
      return { status: http.status, url, redirects: 0 };
    },
  };
  gmail = {
    calls: [],
    async sendMessage(message) {
      gmail.calls.push(['sendMessage', message.raw.toString('utf8')]);
      return 'sent-1';
    },
    async archive(id) {
      gmail.calls.push(['archive', id]);
    },
  };
});

describe('UnsubscribeService.listSenders', () => {
  it('lists senders with counts, read rate, latest risk and the one method offered', () => {
    store('n1', { from: 'news@shop.example', isRead: true });
    store('n2', { from: 'news@shop.example', date: '2026-10-07T10:00:00.000Z' });
    store('m1', { from: 'mail@list.example', url: 'mailto:unsub@list.example?subject=stop' });
    store('b1', { from: 'bare@nolink.example', url: null, oneClick: false });
    store('p1', { from: 'phish@evil.example', level: 'DANGEROUS' });
    store('u1', { from: 'unscored@new.example', level: null });
    store('h1', { from: 'http@weak.example', url: 'https://weak.example/u', oneClick: false });
    senders.setStatus('bare@nolink.example', 'KEPT');

    const list = service().listSenders();
    expect(list.map((s) => [s.address, s.method, s.level, s.status])).toEqual([
      ['news@shop.example', 'unsubscribe', 'SAFE', 'NONE'],
      ['bare@nolink.example', 'block', 'SAFE', 'KEPT'],
      ['http@weak.example', 'block', 'SAFE', 'NONE'],
      ['mail@list.example', 'unsubscribe_mail', 'SAFE', 'NONE'],
      ['phish@evil.example', 'report_spam', 'DANGEROUS', 'NONE'],
      ['unscored@new.example', 'report_spam', null, 'NONE'],
    ]);
    expect(list[0]).toMatchObject({
      emailCount: 2,
      readCount: 1,
      readRate: 0.5,
      lastReceived: '2026-10-07T10:00:00.000Z',
    });
    expect(service().listSenders({ sort: 'read' })[0].address).not.toBe('news@shop.example');
    expect(
      service()
        .listSenders({ since: '2026-10-07T09:30:00.000Z' })
        .map((s) => s.address),
    ).toEqual(['news@shop.example']);
  });
});

describe('UnsubscribeService.requestUnsubscribe', () => {
  it('one-click POSTs to the link of a SAFE sender and records the status', async () => {
    store('n1', { from: 'news@shop.example' });
    const result = await service().requestUnsubscribe('News@shop.example');
    expect(result).toEqual({ status: 'UNSUBSCRIBED', method: 'one_click' });
    expect(http.calls).toEqual([
      [
        'https://news.example/unsub?id=1',
        {
          body: 'List-Unsubscribe=One-Click',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        },
      ],
    ]);
    expect(senders.get('news@shop.example').status).toBe('UNSUBSCRIBED');
    expect(audit.map((a) => a.event)).toEqual(['sender_unsubscribed', 'action_performed']);
    expect(audit[0]).toMatchObject({
      actor: 'user',
      subject: 'news@shop.example',
      data: { method: 'one_click', gmailId: 'n1' },
    });
  });

  it('never contacts the link of a SUSPICIOUS, DANGEROUS or unscored sender (F9 AC)', async () => {
    store('p1', { from: 'phish@evil.example', level: 'DANGEROUS' });
    store('s1', { from: 'odd@maybe.example', level: 'SUSPICIOUS' });
    store('u1', { from: 'unscored@new.example', level: null });
    const s = service();
    await expect(s.requestUnsubscribe('phish@evil.example')).rejects.toThrow(/DANGEROUS/);
    await expect(s.requestUnsubscribe('odd@maybe.example')).rejects.toThrow(/SUSPICIOUS/);
    await expect(s.requestUnsubscribe('unscored@new.example')).rejects.toThrow(/SUSPICIOUS/);
    await expect(s.requestUnsubscribe('nobody@nowhere.example')).rejects.toThrow(UnsubscribeError);
    // Even if the policy were bypassed, the service checks again.
    await expect(s.unsubscribe('phish@evil.example')).rejects.toThrow(/DANGEROUS/);
    expect(http.calls).toEqual([]);
    expect(gmail.calls).toEqual([]);
    expect(senders.get('phish@evil.example').status).toBe('NONE');
  });

  it('refuses senders without a one-click https link and leaves the status alone', async () => {
    store('b1', { from: 'bare@nolink.example', url: null, oneClick: false });
    store('h1', { from: 'http@weak.example', url: 'https://weak.example/u', oneClick: false });
    const s = service();
    await expect(s.requestUnsubscribe('bare@nolink.example')).rejects.toThrow(/block/);
    await expect(s.requestUnsubscribe('http@weak.example')).rejects.toThrow(/one-click/);
    expect(http.calls).toEqual([]);
  });

  it('treats a mailto link as sending an email the click approves', async () => {
    store('m1', { from: 'mail@list.example', url: 'mailto:Unsub@list.example?subject=stop%20now' });
    const result = await service().requestUnsubscribe('mail@list.example', { via: 'dashboard' });
    expect(result).toEqual({ status: 'UNSUBSCRIBED', method: 'mailto' });
    expect(http.calls).toEqual([]);
    expect(gmail.calls[0][1]).toContain('To: unsub@list.example');
    expect(gmail.calls[0][1]).toContain('Subject: stop now');
    expect(audit.map((a) => a.event)).toEqual([
      'approval_requested',
      'sender_unsubscribed',
      'action_performed',
      'approval_decided',
    ]);
  });

  it('reports an endpoint failure without marking the sender unsubscribed', async () => {
    store('n1', { from: 'news@shop.example' });
    http.status = 500;
    await expect(service().requestUnsubscribe('news@shop.example')).rejects.toThrow(/HTTP 500/);
    expect(senders.get('news@shop.example').status).toBe('NONE');
  });
});

describe('UnsubscribeService block / keep / undo / archiveAll', () => {
  it('blocks through the approval the click grants, with the notifier warning when relevant', async () => {
    store('b1', { from: 'bare@nolink.example', url: null, oneClick: false });
    const s = service();
    expect(await s.block('bare@nolink.example')).toEqual({ status: 'BLOCKED', warning: null });
    expect(senders.get('bare@nolink.example').status).toBe('BLOCKED');
    expect(audit.map((a) => a.event)).toEqual([
      'approval_requested',
      'action_performed',
      'approval_decided',
      'sender_blocked',
    ]);

    expect(s.blockWarning('no-reply@accounts.google.com')).toMatch(/Warning/);
    expect(s.blockWarning('news@shop.example')).not.toMatch(/Warning/);
    expect(await s.block('no-reply@accounts.google.com')).toMatchObject({
      status: 'BLOCKED',
      warning: expect.stringMatching(/security notifier/),
    });
  });

  it('keep and undo change only the status and say an unsubscribe cannot be reverted', () => {
    store('n1', { from: 'news@shop.example' });
    const s = service();
    expect(s.keep('news@shop.example')).toEqual({ status: 'KEPT' });
    expect(senders.get('news@shop.example').status).toBe('KEPT');
    expect(s.undo('news@shop.example')).toMatchObject({ status: 'NONE', resubscribed: false });
    expect(senders.get('news@shop.example').status).toBe('NONE');
    expect(audit.map((a) => a.event)).toEqual(['sender_kept', 'sender_status_reverted']);
  });

  it('archives every stored email from the sender through the executor', async () => {
    store('n1', { from: 'news@shop.example' });
    store('n2', { from: 'news@shop.example', date: '2026-10-07T10:00:00.000Z' });
    store('o1', { from: 'other@shop.example' });
    expect(await service().archiveAll('news@shop.example')).toEqual({ archived: 2 });
    expect(gmail.calls).toEqual([
      ['archive', 'n2'],
      ['archive', 'n1'],
    ]);
    expect(audit.at(-1)).toMatchObject({ event: 'sender_archived_all', data: { archived: 2 } });
  });
});

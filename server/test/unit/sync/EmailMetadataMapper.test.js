import { describe, expect, it } from 'vitest';
import { TextNormalizer } from '../../../src/security/ingest/TextNormalizer.js';
import { EmailMetadataMapper } from '../../../src/sync/EmailMetadataMapper.js';

const mapper = new EmailMetadataMapper({ textNormalizer: new TextNormalizer() });

function metadata(overrides = {}) {
  return {
    id: 'm1',
    threadId: 't1',
    labelIds: ['INBOX', 'UNREAD'],
    internalDate: new Date('2026-10-01T10:00:00Z'),
    headers: {
      from: '"Rahul Mehta, CEO" <Rahul@Acme-Corp.com>',
      to: 'me@gmail.com, "Team" <team@acme-corp.com>',
      cc: 'boss@acme-corp.com',
      subject: 'Quick question',
      date: 'Mon, 01 Jan 1990 00:00:00 +0000',
      ...overrides.headers,
    },
    ...overrides,
    ...(overrides.headers ? { headers: { ...overrides.headers } } : {}),
  };
}

describe('EmailMetadataMapper', () => {
  it('maps addresses, direction and read state', () => {
    const record = mapper.toRecord(metadata());
    expect(record).toMatchObject({
      gmailId: 'm1',
      threadId: 't1',
      direction: 'inbound',
      fromAddr: 'rahul@acme-corp.com',
      fromDomain: 'acme-corp.com',
      fromName: 'Rahul Mehta, CEO',
      toAddrs: ['me@gmail.com', 'team@acme-corp.com', 'boss@acme-corp.com'],
      isRead: false,
    });
  });

  it("uses Gmail's receive time, not the sender-controlled Date header", () => {
    expect(mapper.toRecord(metadata()).date).toBe('2026-10-01T10:00:00.000Z');
  });

  it('keeps the subject hash and the normalised subject for the inbox list', () => {
    const record = mapper.toRecord(metadata());
    expect(record.subjectHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.subject).toBe('Quick question');
    expect(
      mapper.toRecord(metadata({ headers: { subject: '\u200BＰａｙＰａｌ  \u202Einvoice' } }))
        .subject,
    ).toBe('PayPal invoice');
    expect(mapper.toRecord(metadata({ headers: { subject: undefined } })).subject).toBe('');
    expect(
      mapper.toRecord(metadata({ headers: { subject: 'x'.repeat(400) } })).subject,
    ).toHaveLength(300);
  });

  it("decodes and normalises Gmail's snippet, capped at 160 characters", () => {
    expect(mapper.toRecord(metadata()).snippet).toBe('');
    expect(
      mapper.toText({ headers: {}, snippet: 'Rahul&#39;s deck &amp; notes &lt;draft&gt;' }),
    ).toEqual({ subject: '', snippet: "Rahul's deck & notes <draft>" });
    const long = mapper.toText({ headers: {}, snippet: 'word '.repeat(60) }).snippet;
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long.endsWith('…')).toBe(true);
  });

  it('keeps recipient display names for contact history', () => {
    expect(mapper.toRecord(metadata()).recipientNames).toEqual({ 'team@acme-corp.com': 'Team' });
  });

  it('marks sent mail as outbound', () => {
    expect(mapper.toRecord(metadata({ labelIds: ['SENT'] })).direction).toBe('outbound');
  });

  it('prefers an https unsubscribe link and detects RFC 8058 one-click', () => {
    const record = mapper.toRecord(
      metadata({
        headers: {
          from: 'news@shop.com',
          'list-unsubscribe': '<mailto:unsub@shop.com>, <https://shop.com/u?id=1>',
          'list-unsubscribe-post': 'List-Unsubscribe=One-Click',
        },
      }),
    );
    expect(record).toMatchObject({
      hasListUnsubscribe: true,
      unsubscribeUrl: 'https://shop.com/u?id=1',
      oneClick: true,
    });
  });

  it('does not treat plain-http or mailto-only links as one-click', () => {
    const httpOnly = mapper.toRecord(
      metadata({
        headers: {
          from: 'n@x.com',
          'list-unsubscribe': '<http://x.com/u>',
          'list-unsubscribe-post': 'List-Unsubscribe=One-Click',
        },
      }),
    );
    expect(httpOnly).toMatchObject({ unsubscribeUrl: null, oneClick: false });
    const mailto = mapper.toRecord(
      metadata({ headers: { from: 'n@x.com', 'list-unsubscribe': '<mailto:u@x.com>' } }),
    );
    expect(mailto).toMatchObject({ unsubscribeUrl: 'mailto:u@x.com', oneClick: false });
  });

  it('skips spam, trash, drafts and chats', () => {
    for (const label of ['SPAM', 'TRASH', 'DRAFT', 'CHAT']) {
      expect(mapper.shouldSkip(metadata({ labelIds: [label] }))).toBe(true);
    }
    expect(mapper.shouldSkip(metadata())).toBe(false);
  });

  it('survives a missing or malformed From header', () => {
    const record = mapper.toRecord(metadata({ headers: { from: 'not an address' } }));
    expect(record).toMatchObject({ fromAddr: '', fromDomain: '', fromName: null });
  });
});

import { describe, expect, it } from 'vitest';
import { MimeMessage } from '../../../src/google/MimeMessage.js';

const date = new Date('2026-10-05T10:00:00Z');

describe('MimeMessage', () => {
  it('builds a plain-text message with base64 body', () => {
    const raw = MimeMessage.build({
      to: ['a@x.example'],
      cc: ['b@y.example'],
      subject: 'Hi',
      body: 'Hello\nthere',
      date,
    }).toString('utf8');
    expect(raw).toContain('To: a@x.example\r\nCc: b@y.example\r\nSubject: Hi\r\n');
    expect(raw).toContain('Date: Mon, 05 Oct 2026 10:00:00 GMT\r\n');
    expect(raw).toContain(
      'Content-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n',
    );
    expect(raw.split('\r\n\r\n')[1].trim()).toBe(Buffer.from('Hello\nthere').toString('base64'));
    expect(raw).not.toContain('In-Reply-To');
  });

  it('encodes non-ASCII subjects and threads replies', () => {
    const raw = MimeMessage.build({
      to: ['a@x.example'],
      subject: 'Café ☕',
      body: 'x',
      inReplyTo: '<id@x>',
      date,
    }).toString('utf8');
    expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from('Café ☕').toString('base64')}?=\r\n`);
    expect(raw).toContain('In-Reply-To: <id@x>\r\nReferences: <id@x>\r\n');
  });

  it('rejects header injection and bad recipients', () => {
    expect(() =>
      MimeMessage.build({ to: ['a@x.example'], subject: 'Hi\r\nBcc: eve@evil.example', body: 'x' }),
    ).toThrow(RangeError);
    expect(() =>
      MimeMessage.build({ to: ['a@x.example\r\nBcc: eve@evil.example'], subject: 'Hi', body: 'x' }),
    ).toThrow(RangeError);
    expect(() =>
      MimeMessage.build({ to: ['Eve <eve@evil.example>'], subject: 'Hi', body: 'x' }),
    ).toThrow(RangeError);
    expect(() => MimeMessage.build({ to: [], subject: 'Hi', body: 'x' })).toThrow(RangeError);
  });
});

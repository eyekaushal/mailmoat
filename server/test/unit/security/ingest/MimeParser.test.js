import { describe, expect, it } from 'vitest';
import { IngestError } from '../../../../src/core/errors.js';
import { MimeParser } from '../../../../src/security/ingest/MimeParser.js';

const parser = new MimeParser();

const RAW = [
  'Authentication-Results: mx.google.com; dmarc=pass header.from=acme.com',
  'Received: from mail.acme.com',
  'Authentication-Results: mx.google.com; dmarc=pass header.from=forged.com',
  'From: "Rahul Mehta" <Rahul@Acme.com>',
  'Reply-To: billing@evil.example',
  'To: me@gmail.com, Team: a@acme.com, b@acme.com;',
  'Cc: boss@acme.com',
  'Subject: Invoice',
  'Message-ID: <abc@acme.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="b1"',
  '',
  '--b1',
  'Content-Type: multipart/alternative; boundary="b2"',
  '',
  '--b2',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Pay here https://pay.example.com',
  '--b2',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Pay <a href="https://pay.example.com">here</a></p>',
  '--b2--',
  '--b1',
  'Content-Type: text/html; name="login.html"',
  'Content-Disposition: attachment; filename="login.html"',
  'Content-Transfer-Encoding: base64',
  '',
  Buffer.from('<form></form>').toString('base64'),
  '--b1--',
  '',
].join('\r\n');

describe('MimeParser', () => {
  it('parses addresses, subject and both body parts', async () => {
    const email = await parser.parse(Buffer.from(RAW));
    expect(email.from).toEqual({ address: 'rahul@acme.com', name: 'Rahul Mehta' });
    expect(email.replyTo).toEqual([{ address: 'billing@evil.example', name: null }]);
    expect(email.to.map((m) => m.address)).toEqual(['me@gmail.com', 'a@acme.com', 'b@acme.com']);
    expect(email.cc.map((m) => m.address)).toEqual(['boss@acme.com']);
    expect(email.subject).toBe('Invoice');
    expect(email.messageId).toBe('<abc@acme.com>');
    expect(email.text).toContain('https://pay.example.com');
    expect(email.html).toContain('<a href="https://pay.example.com">');
  });

  it('keeps every header in document order, duplicates included', async () => {
    const email = await parser.parse(Buffer.from(RAW));
    const authResults = email.headers.filter((h) => h.key === 'authentication-results');
    expect(authResults.map((h) => h.value)).toEqual([
      'mx.google.com; dmarc=pass header.from=acme.com',
      'mx.google.com; dmarc=pass header.from=forged.com',
    ]);
  });

  it('returns attachment metadata without content', async () => {
    const email = await parser.parse(Buffer.from(RAW));
    expect(email.attachments).toEqual([
      {
        filename: 'login.html',
        mimeType: 'text/html',
        disposition: 'attachment',
        size: 13,
        inline: false,
      },
    ]);
  });

  it('handles a minimal message with no body parts or sender', async () => {
    const email = await parser.parse(Buffer.from('Subject: hi\r\n\r\n'));
    expect(email).toMatchObject({ from: null, replyTo: [], to: [], html: '', attachments: [] });
  });

  it('throws IngestError when the headers exceed the size limit', async () => {
    const huge = Buffer.from(`X-Pad: ${'a'.repeat(3 * 1024 * 1024)}\r\n\r\n`);
    await expect(parser.parse(huge)).rejects.toBeInstanceOf(IngestError);
  });
});

import { describe, expect, it } from 'vitest';
import { AuthResultsParser } from '../../../../src/security/ingest/AuthResultsParser.js';

const parser = new AuthResultsParser();

const GOOGLE_STAMP =
  'mx.google.com;\r\n       dkim=pass header.i=@Acme.com header.s=s1 header.b=AbC;\r\n' +
  '       spf=pass (google.com: domain of x@acme.com designates 1.2.3.4 as permitted sender; ok) ' +
  'smtp.mailfrom=x@acme.com;\r\n       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=acme.com';

const authResults = (value) => ({ key: 'authentication-results', value });

describe('AuthResultsParser', () => {
  it("reads SPF, DKIM and DMARC from Google's stamp", () => {
    expect(parser.parse([authResults(GOOGLE_STAMP)])).toEqual({
      trusted: true,
      spf: { result: 'pass', mailFrom: 'x@acme.com' },
      dkim: [{ result: 'pass', domain: 'acme.com' }],
      dmarc: { result: 'pass', headerFrom: 'acme.com' },
    });
  });

  it('ignores a forged pass lower in the message', () => {
    const headers = [
      authResults(
        'mx.google.com; dmarc=fail header.from=paypal.com; spf=fail smtp.mailfrom=a@evil.com',
      ),
      { key: 'received', value: 'from evil.com' },
      authResults('mx.google.com; dmarc=pass header.from=paypal.com; spf=pass'),
    ];
    const result = parser.parse(headers);
    expect(result.dmarc.result).toBe('fail');
    expect(result.spf.result).toBe('fail');
  });

  it('is untrusted when the top-most header is not from Google', () => {
    const headers = [
      authResults('evil.example; dmarc=pass header.from=paypal.com'),
      authResults(GOOGLE_STAMP),
    ];
    expect(parser.parse(headers)).toEqual({
      trusted: false,
      spf: { result: 'none', mailFrom: null },
      dkim: [],
      dmarc: { result: 'none', headerFrom: null },
    });
  });

  it('rejects look-alike authserv-ids', () => {
    expect(parser.parse([authResults('mx.google.com.evil.example; dmarc=pass')]).trusted).toBe(
      false,
    );
    expect(parser.parse([authResults('(mx.google.com) evil; dmarc=pass')]).trusted).toBe(false);
  });

  it('is untrusted when there is no Authentication-Results header', () => {
    expect(parser.parse([{ key: 'from', value: 'a@b.com' }]).trusted).toBe(false);
  });

  it('accepts a version number after the authserv-id', () => {
    expect(
      parser.parse([authResults('mx.google.com 1; dmarc=fail header.from=x.com')]).dmarc,
    ).toEqual({
      result: 'fail',
      headerFrom: 'x.com',
    });
  });

  it('defaults missing methods to none and keeps every DKIM signature', () => {
    const result = parser.parse([
      authResults('mx.google.com; dkim=pass header.d=esp.example; dkim=fail header.i=@acme.com'),
    ]);
    expect(result.spf).toEqual({ result: 'none', mailFrom: null });
    expect(result.dmarc).toEqual({ result: 'none', headerFrom: null });
    expect(result.dkim).toEqual([
      { result: 'pass', domain: 'esp.example' },
      { result: 'fail', domain: 'acme.com' },
    ]);
  });

  it('cannot be confused by result-like text inside comments', () => {
    const result = parser.parse([
      authResults('mx.google.com; spf=fail (; dmarc=pass header.from=x.com)'),
    ]);
    expect(result.spf.result).toBe('fail');
    expect(result.dmarc.result).toBe('none');
  });
});

import { describe, expect, it } from 'vitest';
import { HttpError } from '../../../src/core/errors.js';
import { SafeHttpClient } from '../../../src/features/SafeHttpClient.js';

const DNS = {
  'news.example': ['93.184.216.34'],
  'dual.example': ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'],
  'evil.example': ['93.184.216.34', '10.0.0.5'],
  'internal.example': ['192.168.1.10'],
  'v6local.example': ['fd12::1'],
  'mapped.example': ['::ffff:127.0.0.1'],
};
const lookup = async (host, { all }) => {
  const addresses = DNS[host];
  if (!addresses) throw new Error('ENOTFOUND');
  return all
    ? addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
    : { address: addresses[0] };
};

/** A transport that records every request and answers from a script. */
function transport(script) {
  const calls = [];
  return {
    calls,
    send: async (request) => {
      calls.push({ ...request, url: request.url.href });
      const next = script.shift() ?? { status: 200, headers: {}, body: '' };
      return next;
    },
  };
}

const client = (script = [], options = {}) => {
  const t = transport(script);
  return { client: new SafeHttpClient({ lookup, send: t.send, ...options }), calls: t.calls };
};

describe('SafeHttpClient.isPublicAddress', () => {
  it.each([
    ['93.184.216.34', true],
    ['8.8.8.8', true],
    ['127.0.0.1', false],
    ['10.1.2.3', false],
    ['172.16.0.1', false],
    ['172.31.255.255', false],
    ['172.32.0.1', true],
    ['192.168.0.1', false],
    ['169.254.169.254', false],
    ['100.64.0.1', false],
    ['0.0.0.0', false],
    ['224.0.0.1', false],
    ['255.255.255.255', false],
    ['198.18.0.1', false],
    ['192.0.2.1', false],
    ['2606:2800:220:1:248:1893:25c8:1946', true],
    ['::1', false],
    ['::', false],
    ['fc00::1', false],
    ['fd12:3456::1', false],
    ['fe80::1', false],
    ['ff02::1', false],
    ['::ffff:10.0.0.1', false],
    ['::ffff:a00:1', false],
    ['64:ff9b::10.0.0.1', false],
    ['2001:db8::1', false],
    ['not-an-ip', false],
  ])('%s → %s', (ip, expected) => {
    expect(SafeHttpClient.isPublicAddress(ip)).toBe(expected);
  });
});

describe('SafeHttpClient.check', () => {
  it('accepts a plain https URL whose every address is public', async () => {
    const { client: c } = client();
    expect(await c.check('https://dual.example/unsub?id=1')).toMatchObject({
      address: '93.184.216.34',
    });
    expect(await c.check('https://93.184.216.34/u')).toMatchObject({ address: '93.184.216.34' });
    expect(await c.check('https://news.example:443/u')).toMatchObject({ address: '93.184.216.34' });
  });

  it.each([
    ['http://news.example/u', /https/],
    ['https://user:pw@news.example/u', /userinfo/],
    ['https://news.example:8443/u', /port 443/],
    ['https://internal.example/u', /private/],
    ['https://evil.example/u', /private/],
    ['https://v6local.example/u', /private/],
    ['https://mapped.example/u', /private/],
    ['https://127.0.0.1/u', /private/],
    ['https://[::1]/u', /private/],
    ['https://169.254.169.254/latest/meta-data', /private/],
    ['https://unknown.example/u', /resolved/],
    ['not a url', /Malformed/],
    ['ftp://news.example/u', /https/],
  ])('refuses %s', async (url, message) => {
    const { client: c } = client();
    await expect(c.check(url)).rejects.toThrow(HttpError);
    await expect(c.check(url)).rejects.toThrow(message);
  });
});

describe('SafeHttpClient.post', () => {
  it('POSTs the body to the checked address with a content length', async () => {
    const { client: c, calls } = client([{ status: 200, headers: {}, body: 'ok' }]);
    const result = await c.post('https://news.example/unsub', {
      body: 'List-Unsubscribe=One-Click',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(result).toEqual({ status: 200, url: 'https://news.example/unsub', redirects: 0 });
    expect(calls).toEqual([
      {
        url: 'https://news.example/unsub',
        address: '93.184.216.34',
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': '26' },
        body: 'List-Unsubscribe=One-Click',
      },
    ]);
  });

  it('follows redirects by hand, re-checking each target and switching to GET for 302', async () => {
    const { client: c, calls } = client([
      { status: 307, headers: { location: '/step2' }, body: '' },
      { status: 302, headers: { location: 'https://dual.example/done' }, body: '' },
      { status: 204, headers: {}, body: '' },
    ]);
    const result = await c.post('https://news.example/unsub', { body: 'x' });
    expect(result).toEqual({ status: 204, url: 'https://dual.example/done', redirects: 2 });
    expect(calls.map((call) => [call.method, call.url, call.body])).toEqual([
      ['POST', 'https://news.example/unsub', 'x'],
      ['POST', 'https://news.example/step2', 'x'],
      ['GET', 'https://dual.example/done', null],
    ]);
  });

  it('refuses a redirect to a private host or an http URL, and gives up after the limit', async () => {
    const toPrivate = client([
      { status: 302, headers: { location: 'https://internal.example/x' }, body: '' },
    ]);
    await expect(toPrivate.client.post('https://news.example/u', { body: 'x' })).rejects.toThrow(
      /private/,
    );
    expect(toPrivate.calls).toHaveLength(1);

    const toHttp = client([
      { status: 301, headers: { location: 'http://news.example/x' }, body: '' },
    ]);
    await expect(toHttp.client.post('https://news.example/u', { body: 'x' })).rejects.toThrow(
      /https/,
    );

    const loop = client(
      Array.from({ length: 5 }, () => ({
        status: 308,
        headers: { location: 'https://news.example/again' },
        body: '',
      })),
      { maxRedirects: 2 },
    );
    await expect(loop.client.post('https://news.example/u', { body: 'x' })).rejects.toThrow(
      /Too many redirects/,
    );
    expect(loop.calls).toHaveLength(3);
  });

  it('returns non-2xx statuses for the caller to judge', async () => {
    const { client: c } = client([{ status: 500, headers: {}, body: '' }]);
    expect(await c.post('https://news.example/u', { body: 'x' })).toMatchObject({ status: 500 });
  });
});

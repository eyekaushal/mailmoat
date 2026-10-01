import { describe, expect, it } from 'vitest';
import { LinkExtractor } from '../../../../src/security/ingest/LinkExtractor.js';

const extractor = new LinkExtractor();
const fromHtml = (html) => extractor.extract({ html, text: '' });

describe('LinkExtractor', () => {
  it('captures the visible text and the real href separately', () => {
    expect(
      fromHtml(
        '<a href="https://netflix.com.account-verify.example/login">Update <b>payment</b></a>',
      ),
    ).toEqual([
      {
        href: 'https://netflix.com.account-verify.example/login',
        text: 'Update payment',
        source: 'html',
        host: 'netflix.com.account-verify.example',
      },
    ]);
  });

  it('decodes entities and keeps a domain shown as link text', () => {
    const [link] = fromHtml('<a href="https://evil.example/?a=1&amp;b=2">https://paypal.com</a>');
    expect(link).toMatchObject({
      href: 'https://evil.example/?a=1&b=2',
      text: 'https://paypal.com',
    });
  });

  it('uses image alt text for image-only buttons', () => {
    const [link] = fromHtml('<a href="https://x.example"><img src="cid:1" alt="Sign in"></a>');
    expect(link.text).toBe('Sign in');
  });

  it('includes image-map areas and links inside templates', () => {
    const links = fromHtml(
      '<map><area href="https://a.example" alt="Area"></map><template><a href="https://t.example">T</a></template>',
    );
    expect(links.map((l) => l.host)).toEqual(['a.example', 't.example']);
  });

  it('keeps userinfo tricks with the real host', () => {
    const [link] = fromHtml('<a href="https://paypal.com@evil.example/">PayPal</a>');
    expect(link.host).toBe('evil.example');
  });

  it('encodes Unicode hosts as punycode', () => {
    const [link] = fromHtml('<a href="https://раypal.com/">x</a>');
    expect(link.host).toMatch(/^xn--/);
  });

  it('returns a null host for non-http and unparseable hrefs', () => {
    const links = fromHtml(
      '<a href="mailto:a@b.com">mail</a><a href="javascript:alert(1)">js</a><a href="/relative">rel</a>',
    );
    expect(links.map((l) => l.host)).toEqual([null, null, null]);
  });

  it('skips anchors without an href and in-page fragments', () => {
    expect(fromHtml('<a name="top">x</a><a href="#top">up</a><a href="  ">blank</a>')).toEqual([]);
  });

  it('extracts plain-text URLs without surrounding punctuation', () => {
    const links = extractor.extract({
      html: '',
      text: 'Visit https://a.example/path. Or <https://b.example>, (https://c.example/x)',
    });
    expect(links.map((l) => l.href)).toEqual([
      'https://a.example/path',
      'https://b.example',
      'https://c.example/x',
    ]);
    expect(links[0]).toMatchObject({
      text: 'https://a.example/path',
      source: 'text',
      host: 'a.example',
    });
  });

  it('removes exact duplicates but keeps the same href with different text', () => {
    const links = extractor.extract({
      html: '<a href="https://a.example">One</a><a href="https://a.example">One</a><a href="https://a.example">Two</a>',
      text: 'https://a.example https://a.example',
    });
    expect(links.map((l) => `${l.source}:${l.text}`)).toEqual([
      'html:One',
      'html:Two',
      'text:https://a.example',
    ]);
  });

  it('returns nothing for empty parts', () => {
    expect(extractor.extract({ html: '', text: '' })).toEqual([]);
  });
});

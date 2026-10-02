import { describe, expect, it } from 'vitest';
import { OrgDomain } from '../../../../src/security/signals/OrgDomain.js';

describe('OrgDomain', () => {
  it('reduces subdomains to the organisational domain', () => {
    expect(OrgDomain.of('mail.news.Acme.com')).toBe('acme.com');
    expect(OrgDomain.of('billing.acme.co.uk')).toBe('acme.co.uk');
    expect(OrgDomain.of('acme.com.')).toBe('acme.com');
  });

  it('compares organisations, not exact domains', () => {
    expect(OrgDomain.same('mail.acme.com', 'acme.com')).toBe(true);
    expect(OrgDomain.same('acme.com', 'acme-corp.com')).toBe(false);
    expect(OrgDomain.same('acme.com.evil.example', 'acme.com')).toBe(false);
  });

  it('recognises free-mail domains', () => {
    expect(OrgDomain.isFreemail('Gmail.com')).toBe(true);
    expect(OrgDomain.isFreemail('acme.com')).toBe(false);
  });

  it('takes the domain from an address', () => {
    expect(OrgDomain.ofAddress('a@B.example')).toBe('b.example');
  });
});

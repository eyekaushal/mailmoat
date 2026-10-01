import { describe, expect, it } from 'vitest';
import { Confusables } from '../../../../src/security/signals/Confusables.js';
import { DomainSimilarity } from '../../../../src/security/signals/DomainSimilarity.js';

const similarity = new DomainSimilarity(new Confusables());

describe('DomainSimilarity', () => {
  it.each([
    ['acme-c0rp.com', 'acme-corp.com'], // homoglyph
    ['acme-copr.com', 'acme-corp.com'], // swap
    ['acmecorp.com', 'acme-corp.com'], // deletion
    ['acme-corp.co', 'acme-corp.com'], // TLD
    ['acme-c0rpp.com', 'acme-corp.com'], // two edits on a long domain
    ['xn--pypal-4ve.com', 'paypal.com'], // punycode of Cyrillic а
    ['ups.corn', 'ups.com'], // rn → m on a short domain
  ])('%s imitates %s', (candidate, genuine) => {
    expect(similarity.isLookalike(candidate, genuine)).toBe(true);
  });

  it.each([
    ['acme-corp.com', 'acme-corp.com'], // identical
    ['mail.acme-corp.com', 'acme-corp.com'], // same organisation
    ['ubs.com', 'ups.com'], // short, unrelated real companies
    ['acme.com', 'zenith.com'],
    ['acme-cxyz.com', 'acme-corp.com'], // three edits
  ])('%s does not imitate %s', (candidate, genuine) => {
    expect(similarity.isLookalike(candidate, genuine)).toBe(false);
  });

  it('counts an adjacent swap as one edit', () => {
    expect(similarity.distance('copr', 'corp')).toBe(1);
    expect(similarity.distance('kitten', 'sitting')).toBe(3);
  });
});

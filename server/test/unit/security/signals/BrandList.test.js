import { describe, expect, it } from 'vitest';
import { BrandList } from '../../../../src/security/signals/BrandList.js';
import { Confusables } from '../../../../src/security/signals/Confusables.js';

const brands = new BrandList(new Confusables());
const brand = (name) => brands.all().find((entry) => entry.name === name);

describe('BrandList', () => {
  it.each([
    ['Netflix', 'Netflix'],
    ['PayPaI Security Team', 'PayPal'],
    ['Wells Fargo Online', 'Wells Fargo'],
    ['netflix-account-help.com', 'Netflix'],
    ['Bank of America Alerts', 'Bank of America'],
  ])('finds the brand named in %s', (text, expected) => {
    expect(brands.namedIn(text)?.name).toBe(expected);
  });

  it.each(['Rahul Mehta', 'groups.example.com', 'Applebees Rewards', 'Edward Norton'])(
    'finds no brand in %s',
    (text) => {
      expect(brands.namedIn(text)).toBeUndefined();
    },
  );

  it('knows which domains a brand really uses', () => {
    expect(brands.owns(brand('Netflix'), 'mailer.netflix.com')).toBe(true);
    expect(brands.owns(brand('Netflix'), 'netflix-account-help.com')).toBe(false);
  });

  it('never treats a free-mail domain as proof of a brand', () => {
    expect(brands.owns(brand('Microsoft'), 'outlook.com')).toBe(false);
    expect(brands.owns(brand('Google'), 'gmail.com')).toBe(false);
  });
});

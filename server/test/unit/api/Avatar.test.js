import { describe, expect, it } from 'vitest';
import { Avatar } from '../../../src/api/Avatar.js';

describe('Avatar', () => {
  it('takes first and last initials from a name, one letter from a bare address', () => {
    expect(Avatar.for({ name: 'Rahul Mehta', address: 'rahul@acme.example' }).initials).toBe('RM');
    expect(Avatar.for({ name: 'Rahul Kumar Mehta', address: 'r@x.io' }).initials).toBe('RM');
    expect(Avatar.for({ name: 'Rahul', address: 'r@x.io' }).initials).toBe('R');
    expect(Avatar.for({ name: null, address: 'news@shop.example' }).initials).toBe('N');
    expect(Avatar.for({ name: '"Dr. Priya" ', address: 'p@x.io' }).initials).toBe('DP');
    expect(Avatar.for({ name: '*** !!!', address: '42@x.io' }).initials).toBe('4');
    expect(Avatar.for({ name: null, address: '' }).initials).toBe('?');
  });

  it('gives one address the same hue regardless of case, and different addresses other hues', () => {
    const a = Avatar.for({ address: 'Rahul@Acme.example' });
    expect(a.hue).toBe(Avatar.for({ address: 'rahul@acme.example' }).hue);
    expect(a.hue).toBeGreaterThanOrEqual(0);
    expect(a.hue).toBeLessThan(360);
    const hues = new Set(
      ['a@x.io', 'b@x.io', 'c@x.io', 'd@x.io', 'e@x.io'].map(
        (address) => Avatar.for({ address }).hue,
      ),
    );
    expect(hues.size).toBeGreaterThan(3);
  });
});

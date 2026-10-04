import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, hueOf, initialsOf } from '../../src/ui/Avatar.jsx';

describe('Avatar', () => {
  it('derives initials from a name or a bare address', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL');
    expect(initialsOf('ada')).toBe('A');
    expect(initialsOf('ada@example.com')).toBe('A');
    expect(initialsOf('"Grace Brewster Hopper" <g@x.io>')).toBe('GB');
    expect(initialsOf('')).toBe('?');
  });

  it('gives the same address the same hue every time', () => {
    expect(hueOf('Boss@Acme.com')).toBe(hueOf('boss@acme.com'));
    expect(hueOf('a@x.io')).toBeGreaterThanOrEqual(0);
    expect(hueOf('a@x.io')).toBeLessThan(360);
  });

  it('renders initials on a soft colour, or the photo when there is one', () => {
    const { container, rerender } = render(<Avatar name="Ada Lovelace" hueKey="ada@x.io" />);
    expect(container.textContent).toBe('AL');
    expect(container.firstChild.style.background).not.toBe('');
    rerender(<Avatar name="Ada" src="/me.png" />);
    expect(container.querySelector('img').getAttribute('src')).toBe('/me.png');
    expect(container.textContent).toBe('');
  });
});

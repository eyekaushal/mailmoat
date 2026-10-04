import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Highlight, termsOf } from '../../src/ui/Highlight.jsx';

describe('Highlight', () => {
  it('keeps the words of a query and drops operators, quotes, booleans and single letters', () => {
    expect(termsOf('from:rahul "quarterly deck" OR q (budget)')).toEqual([
      'quarterly',
      'budget',
      'deck',
    ]);
    expect(termsOf('is:unread')).toEqual([]);
    expect(termsOf('')).toEqual([]);
  });

  it('marks every case-insensitive match and leaves the rest as plain text', () => {
    const { container } = render(
      <p>
        <Highlight text="Quarterly deck: the DECK (v2).*" terms={['deck', '(v2).*']} />
      </p>,
    );
    const marks = [...container.querySelectorAll('mark')].map((mark) => mark.textContent);
    expect(marks).toEqual(['deck', 'DECK', '(v2).*']);
    expect(container.textContent).toBe('Quarterly deck: the DECK (v2).*');
  });

  it('returns the text untouched without terms', () => {
    const { container } = render(
      <p>
        <Highlight text="plain" terms={[]} />
      </p>,
    );
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('plain');
  });
});

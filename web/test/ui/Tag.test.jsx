import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LABELS, Tag, labelFor } from '../../src/ui/Tag.jsx';

describe('Tag', () => {
  it('covers the nine labels in palette order and picks the first a row has', () => {
    expect(LABELS.map((entry) => entry.id)).toEqual([
      'to_reply',
      'awaiting_reply',
      'fyi',
      'newsletter',
      'marketing',
      'calendar',
      'receipt',
      'notification',
      'cold_email',
    ]);
    expect(labelFor(['newsletter', 'to_reply']).id).toBe('to_reply');
    expect(labelFor(['cold_email']).label).toBe('Cold');
    expect(labelFor(['suspicious'])).toBeNull();
    expect(labelFor(undefined)).toBeNull();
  });

  it('renders the label on its tint, lowercase, and nothing for an unknown id', () => {
    const { container, rerender } = render(<Tag label="marketing" />);
    expect(container.textContent).toBe('Marketing');
    expect(container.firstChild.className).toContain('bg-tag-marketing');
    expect(container.firstChild.className).toContain('text-tag-marketing-ink');
    expect(container.firstChild.className).toContain('lowercase');
    rerender(<Tag label={LABELS[0]} />);
    expect(container.textContent).toBe('To reply');
    rerender(<Tag label="dangerous" />);
    expect(container.firstChild).toBeNull();
  });
});

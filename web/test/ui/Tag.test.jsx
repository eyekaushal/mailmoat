import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LABELS, RISK_LABELS, Tag, labelFor, riskLabelFor } from '../../src/ui/Tag.jsx';

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

  it('names the risk of an opened email: nothing for SAFE, the word otherwise, in the risk tint', () => {
    expect(riskLabelFor({ level: 'SAFE' })).toBeNull();
    expect(riskLabelFor({ level: 'SUSPICIOUS' })).toBe(RISK_LABELS.SUSPICIOUS);
    expect(riskLabelFor({ level: 'DANGEROUS' }).label).toBe('Dangerous');
    expect(riskLabelFor(null).label).toBe('Not checked');
    expect(labelFor(['dangerous'])).toBeNull();
    const { container } = render(<Tag label={RISK_LABELS.DANGEROUS} />);
    expect(container.textContent).toBe('Dangerous');
    expect(container.firstChild.className).toContain('bg-tag-risk');
    expect(container.firstChild.className).toContain('text-tag-risk-ink');
  });
});

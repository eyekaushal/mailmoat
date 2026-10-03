import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RiskBadge, riskMeta } from '../../src/components/RiskBadge.jsx';

describe('RiskBadge', () => {
  it.each([
    ['SAFE', 'Safe'],
    ['SUSPICIOUS', 'Suspicious'],
    ['DANGEROUS', 'Dangerous'],
  ])('shows an icon and the word for %s', (level, label) => {
    const { container } = render(<RiskBadge level={level} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.firstChild.dataset.level).toBe(level);
  });

  it('falls back to "Not analysed" for a missing level', () => {
    render(<RiskBadge level={null} />);
    expect(screen.getByText('Not analysed')).toBeTruthy();
    expect(riskMeta(undefined).tone).toBe('neutral');
  });
});

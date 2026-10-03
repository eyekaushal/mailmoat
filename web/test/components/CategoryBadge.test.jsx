import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CategoryBadge } from '../../src/components/CategoryBadge.jsx';

describe('CategoryBadge', () => {
  it('maps a Reader category to a label', () => {
    render(<CategoryBadge category="security_alert" />);
    expect(screen.getByText('Security alert')).toBeTruthy();
  });

  it('never echoes an unknown value', () => {
    render(<CategoryBadge category="<img src=x>" />);
    expect(screen.getByText('Other')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });
});

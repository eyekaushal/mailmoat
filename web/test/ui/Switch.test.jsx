import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from '../../src/ui/Checkbox.jsx';
import { Switch } from '../../src/ui/Switch.jsx';

describe('Switch and Checkbox', () => {
  it('toggles and reports the new value', () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Enabled" checked={false} onCheckedChange={onCheckedChange} />);
    const control = screen.getByRole('switch', { name: 'Enabled' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('is on, disabled and locked for rules that always run', () => {
    render(<Switch aria-label="Security rule" checked={false} locked />);
    const control = screen.getByRole('switch', { name: 'Security rule' });
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(control.hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Always on')).toBeTruthy();
  });

  it('checkbox reports clicks and shows the indeterminate state', () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Checkbox aria-label="Select" checked={false} onCheckedChange={onCheckedChange} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    rerender(<Checkbox aria-label="Select" checked="indeterminate" />);
    expect(screen.getByRole('checkbox', { name: 'Select' }).getAttribute('aria-checked')).toBe(
      'mixed',
    );
  });
});

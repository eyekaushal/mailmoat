import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ACTION_CHIPS, ActionChip, chipFor } from '../../src/ui/ActionChip.jsx';

describe('ActionChip', () => {
  it('maps every rule action onto the chip palette and names unknown ones plainly', () => {
    expect(Object.keys(ACTION_CHIPS)).toEqual(['label', 'archive', 'draft_reply', 'alert', 'log']);
    expect(chipFor('draft_reply')).toMatchObject({
      label: 'Draft',
      tone: expect.stringContaining('chip-draft'),
    });
    expect(chipFor('alert').tone).toContain('chip-block');
    expect(chipFor('mark_read')).toEqual({
      label: 'mark read',
      tone: 'bg-surface-3 text-secondary',
    });
  });

  it('is a plain tinted chip without a handler and a pressable toggle with one', () => {
    const { container, rerender } = render(<ActionChip action="archive" />);
    expect(container.firstChild.tagName).toBe('SPAN');
    expect(container.textContent).toBe('Archive');
    expect(container.firstChild.className).toContain('bg-chip-archive');

    const onToggle = vi.fn();
    rerender(<ActionChip action="archive" selected={false} onToggle={onToggle} />);
    const chip = screen.getByRole('button', { name: 'Archive action' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(chip.className).toContain('bg-surface-2');
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<ActionChip action="archive" onToggle={onToggle} disabled title="Fixed" />);
    expect(screen.getByRole('button').disabled).toBe(true);
    expect(screen.getByRole('button').getAttribute('title')).toBe('Fixed');
  });
});

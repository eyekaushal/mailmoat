import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchLine } from '../../src/ui/SearchLine.jsx';

describe('SearchLine', () => {
  it('focuses on open, submits the trimmed query on Enter and closes on Escape', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<SearchLine initial="deck" onSubmit={onSubmit} onClose={onClose} />);
    const input = screen.getByRole('searchbox', { name: 'Search' });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('deck');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '  quarterly deck ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('quarterly deck');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('esc').tagName).toBe('KBD');
  });
});

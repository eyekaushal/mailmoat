import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Popover } from '../../src/ui/Popover.jsx';

describe('Popover', () => {
  it('anchors a labelled panel to its control and reports Esc as a close', () => {
    const onOpenChange = vi.fn();
    render(
      <Popover
        open
        onOpenChange={onOpenChange}
        label="Why this did not work"
        anchor={<button type="button">Unsubscribe</button>}
      >
        <p>The link does not work.</p>
      </Popover>,
    );
    const panel = screen.getByRole('dialog', { name: 'Why this did not work' });
    expect(panel.textContent).toContain('The link does not work.');
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeTruthy();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders nothing when closed', () => {
    render(
      <Popover
        open={false}
        onOpenChange={() => {}}
        label="x"
        anchor={<button type="button">A</button>}
      >
        hidden
      </Popover>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('hidden')).toBeNull();
  });
});

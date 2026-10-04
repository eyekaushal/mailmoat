import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../../src/components/Button.jsx';
import { Dialog } from '../../src/ui/Dialog.jsx';

describe('Dialog', () => {
  it('shows title, description and actions, and closes from the × button', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog
        open
        onOpenChange={onOpenChange}
        title="Disconnect Google?"
        description="Sync stops until you connect again."
        actions={<Button variant="danger">Disconnect</Button>}
      >
        <p>Body</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Disconnect Google?' });
    expect(dialog.textContent).toContain('Sync stops until you connect again.');
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

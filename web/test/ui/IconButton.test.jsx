import { act, fireEvent, render, screen } from '@testing-library/react';
import { Archive } from '@phosphor-icons/react';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from '../../src/ui/IconButton.jsx';
import { TooltipProvider } from '../../src/ui/Tooltip.jsx';

describe('IconButton', () => {
  it('names the control, clicks through and repeats the label with its key in the tooltip', async () => {
    const onClick = vi.fn();
    render(
      <TooltipProvider>
        <IconButton label="Archive" keys={['e']} icon={Archive} onClick={onClick} />
      </TooltipProvider>,
    );
    const button = screen.getByRole('button', { name: 'Archive' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.focus(button);
    });
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('Archive');
    expect(tip.querySelector('kbd').textContent).toBe('e');
  });
});

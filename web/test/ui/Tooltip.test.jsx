import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KeyHint } from '../../src/ui/KeyHint.jsx';
import { Panel } from '../../src/ui/Panel.jsx';
import { Tooltip, TooltipProvider } from '../../src/ui/Tooltip.jsx';

describe('Tooltip, KeyHint, Panel', () => {
  it('shows the label and key hint on focus', async () => {
    render(
      <TooltipProvider>
        <Tooltip label="Archive" keys={['e']}>
          <button type="button" aria-label="Archive">
            x
          </button>
        </Tooltip>
      </TooltipProvider>,
    );
    await act(async () => {
      fireEvent.focus(screen.getByRole('button', { name: 'Archive' }));
    });
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('Archive');
    expect(tip.querySelector('kbd').textContent).toBe('e');
  });

  it('renders a key as a kbd chip and a panel as a section', () => {
    const { container } = render(
      <Panel className="p-2">
        <KeyHint>/</KeyHint>
      </Panel>,
    );
    expect(container.querySelector('section.panel kbd').textContent).toBe('/');
  });
});

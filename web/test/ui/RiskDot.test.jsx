import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RiskDot, riskNote } from '../../src/ui/RiskDot.jsx';
import { TooltipProvider } from '../../src/ui/Tooltip.jsx';

describe('RiskDot', () => {
  it('names the level for flagged mail, flags unjudged mail and says nothing for SAFE', () => {
    expect(riskNote({ level: 'DANGEROUS' })).toBe('Dangerous');
    expect(riskNote({ level: 'SUSPICIOUS' })).toBe('Suspicious');
    expect(riskNote(null)).toBe('Not checked yet');
    expect(riskNote({ level: 'SAFE' })).toBeNull();
  });

  it('renders a red dot with the word for screen readers, a hollow one when unchecked, none when SAFE', () => {
    const { container, rerender } = render(
      <TooltipProvider>
        <RiskDot verdict={{ level: 'DANGEROUS' }} />
      </TooltipProvider>,
    );
    expect(screen.getByRole('img', { name: 'Dangerous' }).className).toContain('bg-danger');
    rerender(
      <TooltipProvider>
        <RiskDot verdict={null} />
      </TooltipProvider>,
    );
    expect(screen.getByRole('img', { name: 'Not checked yet' }).className).toContain('border');
    rerender(
      <TooltipProvider>
        <RiskDot verdict={{ level: 'SAFE' }} />
      </TooltipProvider>,
    );
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('img')).toBeNull();
  });
});

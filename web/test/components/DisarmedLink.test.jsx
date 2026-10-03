import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DisarmedLink } from '../../src/components/DisarmedLink.jsx';

describe('DisarmedLink', () => {
  it('shows the visible text and the real host, clickable on a SAFE email', () => {
    render(
      <DisarmedLink href="https://www.example.com/path?x=1" text="Open invoice" level="SAFE" />,
    );
    expect(screen.getByText('Open invoice')).toBeTruthy();
    const link = screen.getByRole('link');
    expect(link.textContent).toContain('www.example.com');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.queryByRole('button', { name: 'Open anyway' })).toBeNull();
  });

  it('is not clickable on a SUSPICIOUS email until "Open anyway"', () => {
    render(<DisarmedLink href="https://evil.example/login" text="paypal.com" level="SUSPICIOUS" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('evil.example')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open anyway' }));
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://evil.example/login');
  });

  it('is not clickable when the email has no verdict', () => {
    render(<DisarmedLink href="https://x.example" level={null} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows look-alike hosts in punycode and signal ids inline', () => {
    render(
      <DisarmedLink
        href="https://pаypal.com/"
        text="PayPal"
        level="DANGEROUS"
        signals={[{ id: 'S14', reason: 'text/href mismatch' }]}
      />,
    );
    expect(screen.getByText(/^xn--/)).toBeTruthy();
    expect(screen.getByText('S14')).toBeTruthy();
  });

  it('copes with an unparsable address', () => {
    render(<DisarmedLink href="not a url" text="click" level="SAFE" />);
    expect(screen.getByText('unreadable address')).toBeTruthy();
  });
});

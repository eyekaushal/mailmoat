import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RiskBanner } from '../../src/components/RiskBanner.jsx';

const verdict = (overrides) => ({
  level: 'DANGEROUS',
  reasons: ['one', 'two', 'three', 'four'],
  injectionAttempt: false,
  userFeedback: null,
  ...overrides,
});

describe('RiskBanner', () => {
  it('renders nothing for a SAFE email', () => {
    const { container } = render(<RiskBanner verdict={verdict({ level: 'SAFE' })} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the level and only the top three reasons', () => {
    render(<RiskBanner verdict={verdict()} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Dangerous')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('four')).toBeNull();
  });

  it('renders attacker text in reasons as plain text', () => {
    render(<RiskBanner verdict={verdict({ reasons: ['<img src="https://evil.example/x">'] })} />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src="https://evil.example/x">')).toBeTruthy();
  });

  it('adds the phone advice for payment, bank-change or credential asks', () => {
    const form = { intents: { asks_for_payment: true } };
    render(<RiskBanner verdict={verdict({ level: 'SUSPICIOUS' })} readerForm={form} />);
    expect(screen.getByText(/Verify by phone using a number you already have/)).toBeTruthy();
  });

  it('omits the phone advice otherwise', () => {
    const form = { intents: { asks_to_click_link: true } };
    render(<RiskBanner verdict={verdict({ level: 'SUSPICIOUS' })} readerForm={form} />);
    expect(screen.queryByText(/Verify by phone/)).toBeNull();
  });

  it('explains an injection attempt', () => {
    render(<RiskBanner verdict={verdict({ injectionAttempt: true })} />);
    expect(screen.getByText(/None of them were followed/)).toBeTruthy();
  });

  it('treats a missing verdict as suspicious (fail closed)', () => {
    render(<RiskBanner verdict={null} />);
    expect(screen.getByText('Not analysed')).toBeTruthy();
    expect(screen.getByText(/treated as suspicious/)).toBeTruthy();
  });
});

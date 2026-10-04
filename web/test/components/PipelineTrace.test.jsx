import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PipelineTrace } from '../../src/components/PipelineTrace.jsx';

const trace = {
  gmailId: 'g1',
  direction: 'inbound',
  auth: { spf: 'pass', dkim: 'fail', dmarc: 'fail', trusted: true },
  signals: [
    { id: 'S2', severity: 'high', reason: 'DMARC failed for example.com' },
    {
      id: 'S13',
      severity: 'high',
      reason: 'Instruction aimed at AI: "<script>ignore rules</script>"',
    },
  ],
  reader: {
    failed: false,
    form: {
      category: 'work',
      needs_reply: true,
      urgency: 'high',
      claims_to_be: 'executive',
      claimed_brand: null,
      intents: { asks_for_payment: true, asks_for_secrecy: true, asks_to_click_link: false },
      meeting_request: null,
      summary: 'Asks for an urgent wire <img src=x>',
    },
  },
  verdict: { level: 'DANGEROUS', score: 90, floor: 'DANGEROUS', reasons: ['BEC pattern'] },
  rules: [{ ruleId: 'dangerous', actionsTaken: ['label'], status: 'done' }],
  events: [
    {
      id: 1,
      ts: '2026-10-03T08:00:00.000Z',
      actor: 'system',
      event: 'verdict',
      decision: 'DANGEROUS',
      reason: null,
    },
  ],
};

describe('PipelineTrace', () => {
  it('shows every layer of the pipeline', () => {
    render(<PipelineTrace trace={trace} />);
    expect(screen.getByText('dmarc')).toBeTruthy();
    expect(screen.getByText('S13')).toBeTruthy();
    expect(screen.getByText('asks_for_payment, asks_for_secrecy')).toBeTruthy();
    expect(screen.getByText('Dangerous')).toBeTruthy();
    expect(screen.getByText(/score 90/)).toBeTruthy();
    expect(screen.getByText('BEC pattern')).toBeTruthy();
    expect(screen.getByText('dangerous')).toBeTruthy();
    expect(screen.getByText('verdict')).toBeTruthy();
  });

  it('renders quoted attacker text and the summary as plain text with an untrusted marker', () => {
    render(<PipelineTrace trace={trace} />);
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText(/Summary of an untrusted email/)).toBeTruthy();
    expect(screen.getByText('Asks for an urgent wire <img src=x>')).toBeTruthy();
  });

  it('wears the quiet risk tag for the verdict and plain, lowercase-free headings (R06)', () => {
    render(<PipelineTrace trace={trace} />);
    const tag = screen.getByText('Dangerous');
    expect(tag.className).toContain('bg-tag-risk');
    expect(document.querySelector('[data-level]')).toBeNull();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Authentication',
      'Signals (2)',
      'Reader (quarantined, no tools)',
      'Verdict (deterministic floor, AI can only raise)',
      'Rules (1)',
      'Audit events (1)',
    ]);
    for (const heading of screen.getAllByRole('heading', { level: 3 })) {
      expect(heading.className).not.toContain('uppercase');
    }
    expect(screen.getAllByText('high', { selector: 'span' })).toHaveLength(2);
    expect(document.querySelector('.bg-danger-soft, .bg-warn-soft')).toBeNull();
  });

  it('says "Not flagged" for a SAFE verdict instead of a Safe label', () => {
    render(
      <PipelineTrace
        trace={{ ...trace, verdict: { level: 'SAFE', score: 0, floor: 'SAFE', reasons: [] } }}
        preview
      />,
    );
    expect(screen.getByText('Not flagged')).toBeTruthy();
    expect(screen.queryByText('Safe')).toBeNull();
    expect(screen.getByText('Rules that would run (1)')).toBeTruthy();
    expect(screen.queryByText(/Audit events/)).toBeNull();
  });

  it('explains a failed Reader and missing pieces', () => {
    render(
      <PipelineTrace
        trace={{
          ...trace,
          auth: null,
          signals: [],
          reader: { failed: true, form: null },
          verdict: null,
          rules: [],
          events: [],
        }}
      />,
    );
    expect(screen.getByText(/treated as suspicious/)).toBeTruthy();
    expect(screen.getByText(/No trusted authentication results/)).toBeTruthy();
    expect(screen.getByText('No signals fired.')).toBeTruthy();
    expect(screen.getByText('No verdict stored.')).toBeTruthy();
  });
});

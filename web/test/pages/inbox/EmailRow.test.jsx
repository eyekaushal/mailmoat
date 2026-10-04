import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmailRow } from '../../../src/pages/inbox/EmailRow.jsx';
import { riskNote } from '../../../src/ui/RiskDot.jsx';
import { TooltipProvider } from '../../../src/ui/Tooltip.jsx';

const now = new Date(2026, 9, 5, 12, 0, 0);

const email = (extra = {}) => ({
  gmailId: 'a',
  fromAddr: 'rahul@acme-corp.com',
  fromName: 'Rahul Mehta',
  date: new Date(2026, 9, 5, 9, 41).toISOString(),
  isRead: false,
  subject: 'Quarterly deck',
  snippet: 'Can you send the deck before Friday?',
  summary: 'AI SUMMARY MUST NOT SHOW',
  category: 'work',
  rules: ['fyi', 'to_reply'],
  avatar: { initials: 'RM', hue: 200 },
  verdict: { level: 'SAFE', score: 0, injectionAttempt: false, userFeedback: null },
  ...extra,
});

function renderRow(props) {
  return render(
    <TooltipProvider>
      <ul>
        <EmailRow
          now={now}
          onOpen={() => {}}
          onArchive={() => {}}
          onReply={() => {}}
          onTrust={() => {}}
          {...props}
        />
      </ul>
    </TooltipProvider>,
  );
}

describe('riskNote', () => {
  it('names the level for non-safe mail, flags unjudged mail and says nothing for SAFE', () => {
    expect(riskNote({ level: 'DANGEROUS' })).toBe('Dangerous');
    expect(riskNote({ level: 'SUSPICIOUS' })).toBe('Suspicious');
    expect(riskNote(null)).toBe('Not checked yet');
    expect(riskNote({ level: 'SAFE' })).toBeNull();
  });
});

describe('EmailRow', () => {
  it('shows dot, avatar, sender, one label, subject, snippet and time; no AI text, no Safe', () => {
    const { container } = renderRow({ email: email() });
    expect(screen.getByLabelText('Unread')).toBeTruthy();
    expect(container.textContent).toContain('RM');
    expect(screen.getByText('Rahul Mehta').className).toContain('font-medium');
    expect(screen.getByText('To reply').className).toContain('bg-tag-reply');
    expect(screen.queryByText('FYI')).toBeNull();
    expect(screen.getByText('Quarterly deck').className).toContain('font-medium');
    expect(screen.getByText('Can you send the deck before Friday?').className).toContain(
      'text-secondary',
    );
    expect(container.querySelector('time').textContent).toMatch(/9:41/);
    expect(container.textContent).not.toContain('AI SUMMARY');
    expect(container.textContent).not.toMatch(/Safe/);
    expect(screen.queryByLabelText('Dangerous')).toBeNull();
    expect(screen.queryByLabelText('Suspicious')).toBeNull();
  });

  it('puts a red dot named after the level before the sender of non-safe mail', () => {
    renderRow({
      email: email({ isRead: true, verdict: { level: 'DANGEROUS', injectionAttempt: true } }),
    });
    const dot = screen.getByLabelText('Dangerous');
    expect(dot.className).toContain('bg-danger');
    expect(dot.nextSibling.textContent).toBe('Rahul Mehta');
    expect(screen.queryByLabelText('Unread')).toBeNull();
    expect(screen.getByText('Rahul Mehta').className).not.toContain('font-medium');
    expect(screen.queryByText(/Injection/)).toBeNull();
  });

  it('uses a hollow dot for mail the pipeline has not judged and falls back to the address', () => {
    renderRow({ email: email({ fromName: null, verdict: null, rules: [], subject: '' }) });
    expect(screen.getByLabelText('Not checked yet').className).toContain('border-tertiary');
    expect(screen.getByText('rahul@acme-corp.com')).toBeTruthy();
    expect(screen.getByText('(no subject)')).toBeTruthy();
  });

  it('highlights search terms and wires the three hover actions', () => {
    const onArchive = vi.fn();
    const onReply = vi.fn();
    const onTrust = vi.fn();
    const onOpen = vi.fn();
    const { container } = renderRow({
      email: email(),
      terms: ['deck'],
      onArchive,
      onReply,
      onTrust,
      onOpen,
    });
    expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual([
      'deck',
      'deck',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark sender trusted' }));
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onTrust).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Quarterly/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

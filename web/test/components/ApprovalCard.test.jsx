import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalCard } from '../../src/components/ApprovalCard.jsx';

const now = new Date(2026, 9, 5, 12, 0, 0);
const approval = {
  id: 'ap-1',
  tool: 'reply',
  status: 'PENDING',
  reason: 'Replies always need your approval.',
  emailIds: ['g1'],
  requestedAt: new Date(2026, 9, 3, 8, 0).toISOString(),
  args: {
    email_id: { value: 'g1', sources: [{ type: 'inbox' }], readers: 'user' },
    instructions: { value: 'Accept politely', sources: [{ type: 'user' }], readers: 'public' },
  },
};

describe('ApprovalCard', () => {
  it('renders a pending approval as a reply card with the request time and buttons', () => {
    const onDecide = vi.fn();
    render(<ApprovalCard approval={approval} onDecide={onDecide} now={now} />);
    expect(screen.getByText('Reply')).toBeTruthy();
    expect(screen.getByText('Accept politely')).toBeTruthy();
    expect(screen.getByText('From your inbox')).toBeTruthy();
    expect(document.querySelector('time').textContent).toMatch(/Sat.*8:00/);
    expect(screen.queryByText(/Requested/)).toBeNull();
    expect(screen.queryByText(/pending/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onDecide).toHaveBeenCalledWith('approve');
    expect(screen.getByRole('button', { name: 'Reject' }).className).not.toContain('border');
  });

  it('shows the outcome word and no buttons once decided', () => {
    render(
      <ApprovalCard approval={{ ...approval, status: 'REJECTED' }} onDecide={() => {}} now={now} />,
    );
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('falls back to a generic action card naming the tool', () => {
    render(<ApprovalCard approval={{ ...approval, tool: 'block_sender', args: {} }} now={now} />);
    expect(screen.getByText('Action')).toBeTruthy();
    expect(screen.getByText('block sender')).toBeTruthy();
  });
});

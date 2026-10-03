import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalCard } from '../../src/components/ApprovalCard.jsx';

const approval = {
  id: 'ap-1',
  tool: 'reply',
  status: 'PENDING',
  reason: 'Replies always need your approval.',
  emailIds: ['g1'],
  requestedAt: '2026-10-03T08:00:00.000Z',
  args: {
    email_id: { value: 'g1', sources: [{ type: 'inbox' }], readers: 'user' },
    instructions: { value: 'Accept politely', sources: [{ type: 'user' }], readers: 'public' },
  },
};

describe('ApprovalCard', () => {
  it('renders a pending approval as a reply card with buttons', () => {
    const onDecide = vi.fn();
    render(<ApprovalCard approval={approval} onDecide={onDecide} />);
    expect(screen.getByText('Reply')).toBeTruthy();
    expect(screen.getByText('Accept politely')).toBeTruthy();
    expect(screen.getByText('From your inbox')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(onDecide).toHaveBeenCalledWith('approve');
  });

  it('shows the status and no buttons once decided', () => {
    render(<ApprovalCard approval={{ ...approval, status: 'REJECTED' }} onDecide={() => {}} />);
    expect(screen.getByText('rejected')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('falls back to a generic action card for other tools', () => {
    render(<ApprovalCard approval={{ ...approval, tool: 'block_sender', args: {} }} />);
    expect(screen.getByText('Action')).toBeTruthy();
    expect(screen.getByText('block_sender')).toBeTruthy();
  });
});

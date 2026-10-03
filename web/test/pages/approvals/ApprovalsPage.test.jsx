import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApprovalsPage } from '../../../src/pages/approvals/ApprovalsPage.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const approval = (id, tool = 'send_email') => ({
  id,
  tool,
  status: 'PENDING',
  reason: 'Sending needs your approval.',
  emailIds: [],
  requestedAt: '2026-10-03T08:00:00.000Z',
  args: {
    to: { value: ['bob@example.com'], sources: [{ type: 'user' }], readers: 'public' },
    body: { value: 'Hello', sources: [{ type: 'user' }], readers: 'public' },
  },
});

describe('ApprovalsPage', () => {
  it('shows an empty state', async () => {
    renderPage(<ApprovalsPage />, { server: fakeServer({ 'GET /approvals': [] }) });
    await waitFor(() => expect(screen.getByText('Nothing to approve')).toBeTruthy());
  });

  it('approves, rejects and reports a policy denial', async () => {
    let pending = [approval('a1'), approval('a2', 'reply'), approval('a3')];
    const server = fakeServer({
      'GET /approvals': () => pending,
      'POST /approvals/a1/approve': () => {
        pending = pending.filter((a) => a.id !== 'a1');
        return { id: 'a1', status: 'performed', result: {} };
      },
      'POST /approvals/a2/reject': () => {
        pending = pending.filter((a) => a.id !== 'a2');
        return { id: 'a2', status: 'rejected' };
      },
      'POST /approvals/a3/approve': () => {
        pending = pending.filter((a) => a.id !== 'a3');
        return { id: 'a3', status: 'denied', reason: 'recipient not from you' };
      },
    });
    renderPage(<ApprovalsPage />, { server });
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Send' })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: 'Send' })[0]);
    await waitFor(() => expect(screen.getByText('send email: done.')).toBeTruthy());
    // The reply card (a2) is listed before the remaining send card (a3).
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]);
    await waitFor(() => expect(screen.getByText('reply: rejected.')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(screen.getByText(/refused by the Policy Engine. recipient not from you/)).toBeTruthy(),
    );
    await waitFor(() => expect(screen.getByText('Nothing to approve')).toBeTruthy());
  });
});

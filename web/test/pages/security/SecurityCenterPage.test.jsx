import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SecurityCenterPage } from '../../../src/pages/security/SecurityCenterPage.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

describe('SecurityCenterPage', () => {
  it('shows overview cards for 7 and 30 days, the threat feed and the audit log with filters', async () => {
    const server = fakeServer({
      'GET /security/overview': (body, path) =>
        path.includes('days=30')
          ? {
              days: 30,
              scanned: 900,
              safe: 880,
              suspicious: 15,
              dangerous: 5,
              injectionAttempts: 3,
              denied: 4,
              asked: 20,
              pendingApprovals: 1,
            }
          : {
              days: 7,
              scanned: 120,
              safe: 115,
              suspicious: 4,
              dangerous: 1,
              injectionAttempts: 1,
              denied: 2,
              asked: 6,
              pendingApprovals: 1,
            },
      'GET /security/feed': [
        {
          gmailId: 'g1',
          fromAddr: 'ceo@acme-corp.co',
          fromName: 'The CEO',
          date: '2026-10-02T09:00:00Z',
          level: 'DANGEROUS',
          score: 90,
          reasons: ['Look-alike domain <b>x</b>', 'Asks for a wire', 'Urgent', 'fourth'],
          injectionAttempt: true,
          userFeedback: null,
        },
      ],
      'GET /audit': (body, path) =>
        path.includes('filter=policy_decision')
          ? [
              {
                id: 2,
                ts: '2026-10-02T09:00:01.000Z',
                actor: 'policy',
                event: 'policy_decision',
                subject: 'g1',
                decision: 'DENY',
                reason: 'recipient not from you',
                data: { tool: 'send_email' },
              },
            ]
          : [
              {
                id: 1,
                ts: '2026-10-02T09:00:00.000Z',
                actor: 'system',
                event: 'verdict',
                subject: 'g1',
                decision: 'DANGEROUS',
                reason: null,
                data: null,
              },
              {
                id: 2,
                ts: '2026-10-02T09:00:01.000Z',
                actor: 'policy',
                event: 'policy_decision',
                subject: 'g1',
                decision: 'DENY',
                reason: 'recipient not from you',
                data: { tool: 'send_email' },
              },
            ],
    });
    renderPage(<SecurityCenterPage />, { server });
    await waitFor(() => expect(screen.getByLabelText('Emails scanned: 120')).toBeTruthy());
    expect(screen.getByLabelText('Injection attempts blocked: 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '30 days' }));
    await waitFor(() => expect(screen.getByLabelText('Emails scanned: 900')).toBeTruthy());

    expect(screen.getByText('The CEO')).toBeTruthy();
    expect(screen.getByText('Injection attempt blocked')).toBeTruthy();
    expect(screen.getByText('Look-alike domain <b>x</b>')).toBeTruthy();
    expect(document.querySelector('b')).toBeNull();
    expect(screen.queryByText('fourth')).toBeNull();
    expect(screen.getByRole('link', { name: 'open · trace' }).getAttribute('href')).toBe(
      '/inbox/g1',
    );

    expect(screen.getByText('verdict')).toBeTruthy();
    expect(screen.getByText('DENY')).toBeTruthy();
    expect(screen.getByText(/recipient not from you/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter by event'), {
      target: { value: 'policy_decision' },
    });
    await waitFor(() => expect(screen.queryByText('verdict')).toBeNull());
    expect(screen.getByRole('link', { name: /Export JSON/ }).getAttribute('href')).toBe(
      '/api/audit/export',
    );
  });
});

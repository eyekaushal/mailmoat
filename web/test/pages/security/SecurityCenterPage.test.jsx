import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SecurityCenterPage } from '../../../src/pages/security/SecurityCenterPage.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const overview = (days) =>
  days === 30
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
      };

const feed = [
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
];

describe('SecurityCenterPage', () => {
  it('shows the overview numbers for 7 and 30 days and the threat feed on one layout', async () => {
    const server = fakeServer({
      'GET /security/overview': (body, path) => overview(path.includes('days=30') ? 30 : 7),
      'GET /security/feed': feed,
    });
    renderPage(<SecurityCenterPage />, { server });
    await waitFor(() => expect(screen.getByLabelText('Emails scanned: 120')).toBeTruthy());
    expect(screen.getByLabelText('Injection attempts blocked: 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '30 days' }));
    await waitFor(() => expect(screen.getByLabelText('Emails scanned: 900')).toBeTruthy());

    expect(screen.getByText('The CEO')).toBeTruthy();
    expect(screen.getByText('injection attempt blocked')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Open The CEO and its trace' });
    expect(link.getAttribute('href')).toBe('/inbox/g1?trace=1');
    // Numbers are ink, never a red card; the only red is the dot with its tooltip.
    expect(document.querySelector('.bg-danger-soft')).toBeNull();
    expect(screen.getByRole('img', { name: 'Dangerous' })).toBeTruthy();
  });

  it('no longer shows the audit log (decision 5)', async () => {
    const server = fakeServer({
      'GET /security/overview': overview(7),
      'GET /security/feed': [],
    });
    renderPage(<SecurityCenterPage />, { server });
    await waitFor(() => expect(screen.getByText(/No suspicious or dangerous email/)).toBeTruthy());
    expect(screen.queryByLabelText('Filter by event')).toBeNull();
    expect(screen.queryByRole('link', { name: /Export JSON/ })).toBeNull();
    expect(screen.queryByText(/Audit log/)).toBeNull();
    expect(server.calls.some((c) => c.path.startsWith('/audit'))).toBe(false);
  });
});

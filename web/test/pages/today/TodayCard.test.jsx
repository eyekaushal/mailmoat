import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TodayCard } from '../../../src/pages/today/TodayCard.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

describe('TodayCard', () => {
  it('shows the counts, labels and untrusted highlights', async () => {
    const server = fakeServer({
      'GET /summary/today': {
        date: '2026-10-03',
        received: 14,
        byRule: { 'To Reply': 3, Newsletter: 5, FYI: 2 },
        needsReply: 3,
        meetingsProposed: 1,
        threats: { suspicious: 1, dangerous: 1, injection: 1 },
        highlights: [
          {
            gmailId: 'g1',
            from: 'rahul@acme-corp.com',
            date: '2026-10-03T07:00:00Z',
            summary: 'Asks for the deck <script>x</script>',
            untrusted: true,
          },
        ],
      },
    });
    renderPage(<TodayCard />, { server });
    await waitFor(() => expect(screen.getByText('14 received')).toBeTruthy());
    expect(screen.getByText('need a reply').previousSibling.textContent).toBe('3');
    expect(screen.getByText('threats flagged').previousSibling.textContent).toBe('2');
    expect(screen.getByText(/1 email tried to instruct the assistant/)).toBeTruthy();
    expect(screen.getByText('Newsletter')).toBeTruthy();
    expect(screen.getByText(/AI summaries of untrusted emails/)).toBeTruthy();
    expect(screen.getByText('Asks for the deck <script>x</script>')).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/inbox/g1');
  });
});

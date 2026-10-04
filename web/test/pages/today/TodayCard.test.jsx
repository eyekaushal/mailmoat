import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TodayCard } from '../../../src/pages/today/TodayCard.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

describe('TodayCard', () => {
  it('shows the day, the numbers, the labels and the labelled untrusted highlights', async () => {
    const server = fakeServer({
      'GET /summary/today': {
        date: '2026-10-05',
        received: 14,
        byRule: { 'To Reply': 3, Newsletter: 5, FYI: 2 },
        needsReply: 3,
        meetingsProposed: 1,
        threats: { suspicious: 1, dangerous: 1, injection: 1 },
        highlights: [
          {
            gmailId: 'g1',
            from: 'rahul@acme-corp.com',
            date: '2026-10-05T07:00:00Z',
            summary: 'Asks for the deck <script>x</script>',
            untrusted: true,
          },
        ],
      },
    });
    renderPage(<TodayCard />, { server });
    await waitFor(() => expect(screen.getByText('received')).toBeTruthy());
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Today');
    expect(screen.getByText(/Monday/).textContent).toMatch(/October/);
    expect(screen.getByText('received').previousSibling.textContent).toBe('14');
    expect(screen.getByText('need a reply').previousSibling.textContent).toBe('3');
    expect(screen.getByText('meeting proposed').previousSibling.textContent).toBe('1');
    const threats = screen.getByRole('link', { name: /threats flagged/ });
    expect(threats.getAttribute('href')).toBe('/security');
    expect(threats.textContent).toContain('2');
    expect(threats.className).not.toContain('danger');
    expect(screen.getByText(/1 email tried to instruct the assistant/)).toBeTruthy();
    expect(screen.getByText('Newsletter')).toBeTruthy();
    expect(screen.getByText('Waiting for your reply')).toBeTruthy();
    expect(screen.getByText('AI summaries of untrusted emails')).toBeTruthy();
    expect(screen.getByText('Asks for the deck <script>x</script>')).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByRole('link', { name: /rahul@acme-corp.com/ }).getAttribute('href')).toBe(
      '/inbox/g1',
    );
  });

  it('says so when nothing has arrived yet', async () => {
    const server = fakeServer({
      'GET /summary/today': {
        date: '2026-10-05',
        received: 0,
        byRule: {},
        needsReply: 0,
        meetingsProposed: 0,
        threats: { suspicious: 0, dangerous: 0, injection: 0 },
        highlights: [],
      },
    });
    renderPage(<TodayCard />, { server });
    await waitFor(() => expect(screen.getByText('Nothing received yet today.')).toBeTruthy());
    expect(screen.queryByText('Waiting for your reply')).toBeNull();
    expect(screen.getByText('threats flagged').previousSibling.textContent).toBe('0');
  });
});

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SenderCard } from '../../../src/pages/inbox/SenderCard.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const now = new Date(2026, 9, 5, 12, 0, 0);

const sender = (extra = {}) => ({
  threadId: 't1',
  address: 'rahul@acme-corp.com',
  name: 'Rahul Mehta',
  trusted: false,
  sentCount: 3,
  receivedCount: 12,
  avatar: { initials: 'RM', hue: 20 },
  threads: [
    {
      threadId: 't1',
      gmailId: 'a',
      subject: 'Launch deck',
      date: new Date(2026, 9, 5, 9, 0).toISOString(),
      isRead: false,
      verdict: { level: 'SAFE' },
    },
    {
      threadId: 't2',
      gmailId: 'b',
      subject: 'Invoice #4821',
      date: new Date(2026, 9, 1, 9, 0).toISOString(),
      isRead: true,
      verdict: { level: 'SUSPICIOUS' },
    },
  ],
  ...extra,
});

describe('SenderCard', () => {
  it('shows avatar, name, address, counts and the recent threads with the open one marked', async () => {
    const server = fakeServer({ 'GET /emails/a/sender': sender() });
    renderPage(<SenderCard gmailId="a" now={now} />, { server });
    const card = await screen.findByRole('region', { name: 'Sender' });
    expect(card.textContent).toContain('RM');
    expect(screen.getByRole('heading', { name: 'Rahul Mehta' })).toBeTruthy();
    expect(screen.getByText('rahul@acme-corp.com')).toBeTruthy();
    expect(screen.getByText('12 received · 3 sent')).toBeTruthy();
    expect(card.textContent).not.toMatch(/never written/);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/inbox/a', '/inbox/b']);
    expect(links[0].getAttribute('aria-current')).toBe('true');
    expect(links[1].getAttribute('aria-current')).toBeNull();
    expect(links[0].textContent).toContain('Launch deck');
    expect(links[1].textContent).toMatch(/Oct/);
    expect(screen.getByRole('img', { name: 'Suspicious' })).toBeTruthy();
  });

  it('toggles trust through the API and refreshes', async () => {
    let trusted = false;
    const server = fakeServer({
      'GET /emails/a/sender': () => sender({ trusted }),
      'POST /emails/a/trust-sender': (body) => {
        trusted = body.trusted;
        return { address: 'rahul@acme-corp.com', trusted };
      },
    });
    renderPage(<SenderCard gmailId="a" now={now} />, { server });
    const toggle = await screen.findByRole('switch', { name: 'Trusted sender' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
    expect(server.calls.find((c) => c.path === '/emails/a/trust-sender').body).toEqual({
      trusted: true,
    });
  });

  it('shows a quiet line when nothing is stored and an error line when the toggle fails', async () => {
    const server = fakeServer({
      'GET /emails/a/sender': sender({ threads: [], name: null }),
      'POST /emails/a/trust-sender': () =>
        new Response(JSON.stringify({ error: 'Nope' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
    });
    renderPage(<SenderCard gmailId="a" now={now} />, { server });
    expect(await screen.findByText('Nothing stored from them yet.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'rahul@acme-corp.com' })).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Trusted sender' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Nope'));
  });
});

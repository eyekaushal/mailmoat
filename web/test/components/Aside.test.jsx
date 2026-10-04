import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Aside } from '../../src/components/Aside.jsx';
import { fakeServer, renderPage } from '../helpers.jsx';

describe('Aside', () => {
  it('shows the sender card while an email is open and nothing outside the inbox', async () => {
    const server = fakeServer({
      'GET /emails/a/sender': {
        threadId: 't1',
        address: 'rahul@acme-corp.com',
        name: 'Rahul Mehta',
        trusted: true,
        sentCount: 2,
        receivedCount: 5,
        avatar: { initials: 'RM', hue: 20 },
        threads: [],
      },
    });
    renderPage(<Aside />, { server, path: '/inbox/a', route: '/inbox/:gmailId' });
    const aside = await screen.findByRole('complementary');
    expect(aside.className).toContain('min-[1100px]:flex');
    await screen.findByRole('region', { name: 'Sender' });
    expect(screen.getByRole('heading', { name: 'Rahul Mehta' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Today' })).toBeNull();
  });

  it('renders nothing for other screens', () => {
    const server = fakeServer({});
    renderPage(<Aside />, { server, path: '/settings', route: '/settings' });
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GoogleStep } from '../../../src/pages/setup/GoogleStep.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const disconnected = { clientConfigured: true, connected: false, email: null };

describe('GoogleStep', () => {
  it('explains the unverified warning and where to click before opening Google', async () => {
    const server = fakeServer({
      'GET /google/auth-url': { url: 'https://accounts.google.com/o/oauth2/x' },
    });
    const navigateTo = vi.fn();
    renderPage(<GoogleStep google={disconnected} onContinue={() => {}} navigateTo={navigateTo} />, {
      server,
    });
    expect(screen.getByText(/Google will say “unverified app”/)).toBeTruthy();
    expect(screen.getAllByText('Go to mailmoat (unsafe)').length).toBeGreaterThan(0);
    expect(screen.getByText(/Read, label and archive your Gmail/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Google' }));
    await waitFor(() =>
      expect(navigateTo).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/x'),
    );
  });

  it('shows the error Google sent us back with', () => {
    renderPage(
      <GoogleStep
        google={disconnected}
        result={{ status: 'error', reason: 'access_denied' }}
        onContinue={() => {}}
      />,
      { server: fakeServer({}) },
    );
    expect(screen.getByRole('alert').textContent).toContain('access_denied');
  });

  it('refuses to start without a built-in client', () => {
    renderPage(
      <GoogleStep google={{ ...disconnected, clientConfigured: false }} onContinue={() => {}} />,
      {
        server: fakeServer({}),
      },
    );
    expect(screen.queryByRole('button', { name: 'Continue to Google' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('GOOGLE_CLIENT_ID');
  });

  it('shows the connected account and continues', () => {
    const onContinue = vi.fn();
    renderPage(
      <GoogleStep
        google={{ clientConfigured: true, connected: true, email: 'k@example.com' }}
        onContinue={onContinue}
      />,
      { server: fakeServer({}) },
    );
    expect(screen.getByText('k@example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalled();
  });
});

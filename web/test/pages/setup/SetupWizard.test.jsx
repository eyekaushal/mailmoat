import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SetupWizard } from '../../../src/pages/setup/SetupWizard.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const settingsView = ({ anthropic = false, google = false } = {}) => ({
  settings: {},
  anthropic: {
    configured: anthropic,
    masked: anthropic ? 'sk-ant-…abcd' : null,
    source: anthropic ? 'settings' : null,
  },
  google: { clientConfigured: true, connected: google, email: google ? 'k@example.com' : null },
});

const health = {
  ok: true,
  google: { connected: true },
  anthropic: { configured: true },
  sync: { emails: 42 },
};

describe('SetupWizard', () => {
  it('starts at the key step when nothing is set up', async () => {
    renderPage(<SetupWizard />, {
      server: fakeServer({ 'GET /settings': settingsView() }),
      path: '/setup',
      route: '/setup',
    });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Your Anthropic API key' })).toBeTruthy(),
    );
  });

  it('starts at Google once the key exists', async () => {
    renderPage(<SetupWizard />, {
      server: fakeServer({ 'GET /settings': settingsView({ anthropic: true }) }),
      path: '/setup',
      route: '/setup',
    });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Connect Google' })).toBeTruthy(),
    );
  });

  it('lands on the rules step after Google connects, then finishes with the sync screen', async () => {
    const server = fakeServer({
      'GET /settings': settingsView({ anthropic: true, google: true }),
      'GET /rules': [],
      'GET /health': health,
    });
    renderPage(<SetupWizard />, { server, path: '/setup?google=connected', route: '/setup' });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Choose your rules' })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(screen.getByRole('heading', { name: 'Connected ✓' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('42 emails synced so far')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Open your inbox' }));
    expect(screen.getByText('Inbox screen')).toBeTruthy();
  });

  it('returns to the Google step with the error when sign-in failed', async () => {
    renderPage(<SetupWizard />, {
      server: fakeServer({ 'GET /settings': settingsView({ anthropic: true }) }),
      path: '/setup?google=error&reason=access_denied',
      route: '/setup',
    });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('access_denied'));
  });
});

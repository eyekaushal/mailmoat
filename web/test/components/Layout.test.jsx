import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Layout } from '../../src/components/Layout.jsx';
import { NAV_ITEMS } from '../../src/components/Sidebar.jsx';
import { ApiClient } from '../../src/lib/ApiClient.js';
import { ApiProvider } from '../../src/lib/useApi.js';

function fakeFetch(health, approvals = []) {
  return async (url) => {
    const body = url === '/api/health' ? health : url === '/api/approvals' ? approvals : {};
    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    });
  };
}

function renderShell({ health, approvals, at = '/inbox' }) {
  const client = new ApiClient({ fetch: fakeFetch(health, approvals) });
  return render(
    <ApiProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/inbox" element={<h1>Inbox screen</h1>} />
            <Route path="/approvals" element={<h1>Approvals screen</h1>} />
          </Route>
          <Route path="/setup" element={<h1>Setup wizard</h1>} />
        </Routes>
      </MemoryRouter>
    </ApiProvider>,
  );
}

const connected = {
  ok: true,
  version: '0.1.0',
  google: { connected: true, email: 'kaushal@example.com' },
  anthropic: { configured: true },
  sync: { lastPollAt: '2026-10-03T08:00:00.000Z', emails: 120 },
};

describe('Layout', () => {
  it('renders the seven screens in the sidebar and the current page', async () => {
    renderShell({ health: connected });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    for (const { label } of NAV_ITEMS) expect(nav.textContent).toContain(label);
    expect(screen.getByText('Inbox screen')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Inbox/ }).getAttribute('aria-current')).toBe('page');
    await waitFor(() => expect(screen.getByText('kaushal@example.com')).toBeTruthy());
    expect(screen.getByText(/120 emails/)).toBeTruthy();
    expect(screen.getByText('Anthropic key set')).toBeTruthy();
  });

  it('shows the pending approvals count on the Approvals item', async () => {
    renderShell({ health: connected, approvals: [{ id: 'a' }, { id: 'b' }], at: '/approvals' });
    await waitFor(() => expect(screen.getByLabelText('2 pending').textContent).toBe('2'));
    expect(screen.getByText('Approvals screen')).toBeTruthy();
  });

  it('hands over to the setup wizard until both connections exist', async () => {
    renderShell({ health: { ...connected, google: { connected: false, email: null } } });
    await waitFor(() => expect(screen.getByText('Setup wizard')).toBeTruthy());
    expect(screen.queryByText('Inbox screen')).toBeNull();
  });
});

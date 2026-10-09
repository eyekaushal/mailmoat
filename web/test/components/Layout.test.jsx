import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Layout } from '../../src/components/Layout.jsx';
import { NAV_ITEMS } from '../../src/components/Rail.jsx';
import { ApiClient } from '../../src/lib/ApiClient.js';
import { ApiProvider } from '../../src/lib/useApi.js';
import { TooltipProvider } from '../../src/ui/Tooltip.jsx';

const TODAY = {
  date: '2026-10-05',
  received: 4,
  byRule: {},
  needsReply: 1,
  meetingsProposed: 0,
  threats: { suspicious: 0, dangerous: 0, injection: 0 },
  highlights: [],
};

function fakeFetch(health, approvals = [], settings = {}) {
  return async (url) => {
    const body =
      url === '/api/health'
        ? health
        : url === '/api/approvals'
          ? approvals
          : url === '/api/settings'
            ? { settings }
            : url === '/api/summary/today'
              ? TODAY
              : url === '/api/chats'
                ? []
                : {};
    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    });
  };
}

function renderShell({ health, approvals, settings, at = '/inbox' }) {
  const client = new ApiClient({ fetch: fakeFetch(health, approvals, settings) });
  return render(
    <ApiProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[at]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/inbox" element={<h1>Inbox screen</h1>} />
              <Route path="/approvals" element={<h1>Approvals screen</h1>} />
              <Route path="/settings" element={<h1>Settings screen</h1>} />
            </Route>
            <Route path="/setup" element={<h1>Setup wizard</h1>} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
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
  beforeEach(() => window.localStorage.clear());

  it('renders the icon rail with the seven screens, the current page and the hint bar', async () => {
    renderShell({ health: connected });
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    for (const { label, panel } of NAV_ITEMS)
      expect(screen.getByRole(panel ? 'button' : 'link', { name: label })).toBeTruthy();
    expect(nav.textContent).not.toContain('Inbox'); // labels live in tooltips, not beside icons
    expect(screen.getByText('Inbox screen')).toBeTruthy();
    const inbox = screen.getByRole('link', { name: 'Inbox' });
    expect(inbox.getAttribute('aria-current')).toBe('page');
    expect(inbox.className).toContain('bg-accent-soft');
    expect(screen.getByRole('link', { name: 'Settings' }).className).not.toContain(
      'bg-accent-soft',
    );
    expect(screen.getByRole('note', { name: 'Keyboard hints' }).textContent).toContain('to search');
    expect(document.querySelector('.wallpaper').dataset.wallpaper).toBe('tide');
  });

  it('puts Today in the right panel of the inbox and nowhere else', async () => {
    const { unmount } = renderShell({ health: connected });
    const aside = await screen.findByRole('complementary');
    await waitFor(() => expect(aside.textContent).toContain('need'));
    expect(aside.className).toContain('panel');
    expect(aside.className).toContain('min-[1100px]:flex');
    unmount();
    renderShell({ health: connected, at: '/settings' });
    await screen.findByText('Settings screen');
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('shows the pending approvals count on the Approvals item', async () => {
    renderShell({ health: connected, approvals: [{ id: 'a' }, { id: 'b' }], at: '/approvals' });
    await waitFor(() => expect(screen.getByLabelText('2 pending').textContent).toBe('2'));
    expect(screen.getByText('Approvals screen')).toBeTruthy();
  });

  it('opens the account menu with name, email, status and Settings', async () => {
    renderShell({ health: connected, settings: { userName: 'Kaushal', wallpaper: 'valley' } });
    const account = await screen.findByRole('button', { name: 'Account' });
    await waitFor(() =>
      expect(document.querySelector('.wallpaper').dataset.wallpaper).toBe('valley'),
    );
    fireEvent.pointerDown(account, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    await waitFor(() => expect(screen.getByText('kaushal@example.com')).toBeTruthy());
    expect(screen.getByText('Kaushal')).toBeTruthy();
    expect(screen.getByText(/120 emails/)).toBeTruthy();
    expect(screen.getByText('Anthropic key set')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    await waitFor(() => expect(screen.getByText('Settings screen')).toBeTruthy());
  });

  it('hides the keyboard hints until the account menu brings them back', async () => {
    renderShell({ health: connected });
    const bar = await screen.findByRole('note', { name: 'Keyboard hints' });
    fireEvent.click(screen.getByRole('button', { name: 'Hide keyboard hints' }));
    expect(screen.queryByRole('note', { name: 'Keyboard hints' })).toBeNull();
    expect(window.localStorage.getItem('mailmoat.keyHints')).toBe('hidden');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Account' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Keyboard hints' }));
    expect(screen.getByRole('note', { name: 'Keyboard hints' })).not.toBe(bar);
    expect(window.localStorage.getItem('mailmoat.keyHints')).toBeNull();
  });

  it('opens Ask AI as a side panel from the rail, from ?ask=1, and closes it again', async () => {
    renderShell({ health: connected });
    const toggle = await screen.findByRole('button', { name: 'Ask AI' });
    expect(screen.queryByRole('complementary', { name: 'Ask AI' })).toBeNull();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    const panel = screen.getByRole('complementary', { name: 'Ask AI' });
    expect(panel.textContent).toContain('What can I help you with today?');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.className).toContain('bg-accent-soft');
    expect(screen.getByText('Inbox screen')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close Ask AI' }));
    expect(screen.queryByRole('complementary', { name: 'Ask AI' })).toBeNull();
    screen.getByRole('complementary'); // Today is still there on the right
  });

  it('deep-links to the panel with ?ask=1 and opens the shortcut list on ?', async () => {
    renderShell({ health: connected, at: '/inbox?ask=1' });
    expect(await screen.findByRole('complementary', { name: 'Ask AI' })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: '?' });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Keyboard shortcuts');
    expect(dialog.textContent).toContain('Move down and up the list');
  });

  it('hands over to the setup wizard until both connections exist', async () => {
    renderShell({ health: { ...connected, google: { connected: false, email: null } } });
    await waitFor(() => expect(screen.getByText('Setup wizard')).toBeTruthy());
    expect(screen.queryByText('Inbox screen')).toBeNull();
  });
});

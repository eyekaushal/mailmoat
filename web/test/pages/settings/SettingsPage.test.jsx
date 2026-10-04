import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../../../src/pages/settings/SettingsPage.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const settings = {
  plannerModel: 'claude-opus-5-5',
  drafterModel: 'claude-haiku-4-5',
  pollIntervalSeconds: 60,
  autoArchiveDangerous: false,
  trustedSenders: ['boss@example.com'],
  workingHours: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
  userName: '',
  draftFooter: '',
  meetingDurationMinutes: 30,
  draftRetentionDays: 7,
  wallpaper: 'tide',
};
const view = {
  settings,
  anthropic: { configured: true, masked: 'sk-ant-…abcd', source: 'settings' },
  google: { clientConfigured: true, connected: true, email: 'k@example.com' },
};

describe('SettingsPage', () => {
  it('shows the masked key and connected account, never a full key', async () => {
    renderPage(<SettingsPage />, { server: fakeServer({ 'GET /settings': view }) });
    await waitFor(() => expect(screen.getByText('sk-ant-…abcd')).toBeTruthy());
    expect(screen.getByText(/Connected as k@example.com/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/sk-ant-[A-Za-z0-9_-]{10,}/);
  });

  it('sends only the changed fields on save', async () => {
    const server = fakeServer({
      'GET /settings': view,
      'PUT /settings': (body) => ({ ...view, settings: { ...settings, ...body } }),
    });
    renderPage(<SettingsPage />, { server });
    await waitFor(() => expect(screen.getByLabelText('Planner')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Planner'), { target: { value: 'claude-sonnet-5-5' } });
    fireEvent.click(screen.getByLabelText(/Auto-archive dangerous mail/));
    fireEvent.change(screen.getByLabelText('Add trusted sender'), {
      target: { value: 'Ally@Example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByText('Settings saved.')).toBeTruthy());
    const put = server.calls.find((call) => call.method === 'PUT' && call.path === '/settings');
    expect(put.body).toEqual({
      plannerModel: 'claude-sonnet-5-5',
      autoArchiveDangerous: true,
      trustedSenders: ['boss@example.com', 'ally@example.com'],
    });
  });

  it('removes the saved key and refreshes', async () => {
    let current = view;
    const server = fakeServer({
      'GET /settings': () => current,
      'DELETE /secrets/anthropic': () => {
        current = { ...view, anthropic: { configured: false, masked: null, source: null } };
        return current.anthropic;
      },
    });
    renderPage(<SettingsPage />, { server });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove key' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    await waitFor(() => expect(screen.getByText(/No key saved/)).toBeTruthy());
  });

  it('disconnects Google only after confirmation', async () => {
    const server = fakeServer({
      'GET /settings': view,
      'POST /google/disconnect': { connected: false, revoked: true },
    });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderPage(<SettingsPage />, { server });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(server.calls.some((call) => call.path === '/google/disconnect')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() =>
      expect(server.calls.some((call) => call.path === '/google/disconnect')).toBe(true),
    );
  });

  it('deletes all data only when DELETE is typed', async () => {
    const server = fakeServer({
      'GET /settings': view,
      'POST /data/delete-all': { deleted: true, restart: true },
    });
    renderPage(<SettingsPage />, { server });
    await waitFor(() => expect(screen.getByLabelText('Type DELETE to confirm')).toBeTruthy());
    const button = screen.getByRole('button', { name: /Delete everything/ });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), {
      target: { value: 'delete' },
    });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText(/Everything was deleted/)).toBeTruthy());
    expect(server.calls.find((call) => call.path === '/data/delete-all').body).toEqual({
      confirm: 'DELETE',
    });
  });
});

describe('SettingsPage wallpaper', () => {
  it('saves the wallpaper as soon as a tile is picked', async () => {
    const server = fakeServer({
      'GET /settings': view,
      'PUT /settings': (body) => ({ ...view, settings: { ...settings, ...body } }),
    });
    renderPage(<SettingsPage />, { server });
    const tide = await screen.findByRole('radio', { name: 'Low tide' });
    expect(tide.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Valley' }));
    await waitFor(() =>
      expect(server.calls.find((c) => c.method === 'PUT')?.body).toEqual({ wallpaper: 'valley' }),
    );
  });
});

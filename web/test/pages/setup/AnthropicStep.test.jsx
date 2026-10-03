import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnthropicStep } from '../../../src/pages/setup/AnthropicStep.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const unset = { configured: false, masked: null, source: null };
const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';

describe('AnthropicStep', () => {
  it('asks about the account and shows the Console guide for "yes"', () => {
    renderPage(<AnthropicStep anthropic={unset} onSaved={() => {}} onContinue={() => {}} />, {
      server: fakeServer({}),
    });
    expect(screen.getByText('Do you have an Anthropic account?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, I have one' }));
    const link = screen.getByRole('link', { name: /Open the Console’s API keys page/ });
    expect(link.getAttribute('href')).toBe('https://console.anthropic.com/settings/keys');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByLabelText('Paste your key')).toBeTruthy();
  });

  it('shows three numbered steps and the cost estimate for "no"', () => {
    renderPage(<AnthropicStep anthropic={unset} onSaved={() => {}} onContinue={() => {}} />, {
      server: fakeServer({}),
    });
    fireEvent.click(screen.getByRole('button', { name: 'No, not yet' }));
    expect(screen.getAllByRole('link', { name: /Continue to Anthropic/ })).toHaveLength(3);
    expect(screen.getByText('Sign up')).toBeTruthy();
    expect(screen.getByText('Add credits')).toBeTruthy();
    expect(screen.getByText('Create a key')).toBeTruthy();
    expect(screen.getByText(/≈ \$9 \/ month/)).toBeTruthy();
  });

  it('tests the key through the backend and saves it write-only', async () => {
    const server = fakeServer({
      'POST /secrets/anthropic/test': (body) => ({ ok: body.apiKey === KEY }),
      'PUT /secrets/anthropic': { configured: true, masked: 'sk-ant-…wxyz', source: 'settings' },
    });
    const onSaved = vi.fn();
    renderPage(<AnthropicStep anthropic={unset} onSaved={onSaved} onContinue={() => {}} />, {
      server,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Yes, I have one' }));
    const input = screen.getByLabelText('Paste your key');
    expect(input.type).toBe('password');
    fireEvent.change(input, { target: { value: KEY } });
    fireEvent.click(screen.getByRole('button', { name: 'Test key' }));
    await waitFor(() => expect(screen.getByText('The key works.')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const put = server.calls.find((call) => call.method === 'PUT');
    expect(put.body).toEqual({ apiKey: KEY });
    expect(input.value).toBe('');
  });

  it('reports a failing key', async () => {
    const server = fakeServer({
      'POST /secrets/anthropic/test': { ok: false, reason: 'authentication failed' },
    });
    renderPage(<AnthropicStep anthropic={unset} onSaved={() => {}} onContinue={() => {}} />, {
      server,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Yes, I have one' }));
    fireEvent.change(screen.getByLabelText('Paste your key'), { target: { value: KEY } });
    fireEvent.click(screen.getByRole('button', { name: 'Test key' }));
    await waitFor(() => expect(screen.getByText(/authentication failed/)).toBeTruthy());
  });

  it('shows only the masked key once configured and lets the user continue', () => {
    const onContinue = vi.fn();
    renderPage(
      <AnthropicStep
        anthropic={{ configured: true, masked: 'sk-ant-…wxyz', source: 'env' }}
        onSaved={() => {}}
        onContinue={onContinue}
      />,
      { server: fakeServer({}) },
    );
    expect(screen.getByText(/sk-ant-…wxyz/)).toBeTruthy();
    expect(screen.getByText(/from \.env/)).toBeTruthy();
    expect(screen.queryByLabelText('Paste your key')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(screen.getByText('Do you have an Anthropic account?')).toBeTruthy();
  });
});

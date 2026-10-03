import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BulkUnsubscribePage } from '../../../src/pages/unsubscribe/BulkUnsubscribePage.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const sender = (address, extra = {}) => ({
  address,
  status: 'NONE',
  emailCount: 12,
  readCount: 3,
  readRate: 0.25,
  lastReceived: '2026-10-01T09:00:00.000Z',
  level: 'SAFE',
  method: 'unsubscribe',
  ...extra,
});

describe('BulkUnsubscribePage', () => {
  it('offers one safe method per sender and runs it', async () => {
    const senders = [
      sender('news@shop.example'),
      sender('promo@evil.example', { level: 'DANGEROUS', method: 'report_spam' }),
      sender('digest@club.example', { method: 'block', level: 'SAFE' }),
      sender('old@kept.example', { status: 'KEPT' }),
    ];
    const server = fakeServer({
      'GET /senders': senders,
      'POST /senders/unsubscribe': { status: 'UNSUBSCRIBED', method: 'one_click' },
    });
    renderPage(<BulkUnsubscribePage />, { server });
    await waitFor(() => expect(screen.getByText('news@shop.example')).toBeTruthy());
    expect(screen.getAllByRole('button', { name: 'Unsubscribe' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Block (report in Gmail)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Block' })).toBeTruthy();
    expect(screen.getByText('kept')).toBeTruthy();
    expect(screen.getAllByText('25%')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));
    await waitFor(() =>
      expect(screen.getByText(/unsubscribed with the one-click link/)).toBeTruthy(),
    );
    expect(server.calls.find((c) => c.path === '/senders/unsubscribe').body).toEqual({
      address: 'news@shop.example',
    });
  });

  it('shows the block warning before blocking and respects a cancel', async () => {
    const server = fakeServer({
      'GET /senders': [sender('no-reply@accounts.google.com', { method: 'block' })],
      'GET /senders/block-warning': {
        warning: 'Warning: this looks like a security or account sender.',
      },
      'POST /senders/block': { status: 'BLOCKED', warning: null },
    });
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderPage(<BulkUnsubscribePage />, { server });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Block' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0]).toContain('security or account sender');
    expect(server.calls.some((c) => c.path === '/senders/block')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(server.calls.some((c) => c.path === '/senders/block')).toBe(true));
  });

  it('bulk-unsubscribes only the senders with a safe link, after a confirmation with counts', async () => {
    const server = fakeServer({
      'GET /senders': [
        sender('a@x.example'),
        sender('b@x.example', { method: 'block' }),
        sender('c@x.example', { method: 'unsubscribe_mail' }),
      ],
      'POST /senders/unsubscribe': (body) => ({
        status: 'UNSUBSCRIBED',
        method: body.address.startsWith('c') ? 'mailto' : 'one_click',
      }),
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage(<BulkUnsubscribePage />, { server });
    await waitFor(() => expect(screen.getByLabelText('Select all')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Select all'));
    const toolbar = screen.getByRole('toolbar', { name: 'Bulk actions' });
    expect(toolbar.textContent).toContain('3 selected');
    fireEvent.click(toolbar.querySelector('button'));
    await waitFor(() => expect(screen.getByText('2 of 2 done.')).toBeTruthy());
    expect(confirm.mock.calls[0][0]).toContain('Unsubscribe from 2 senders');
    expect(confirm.mock.calls[0][0]).toContain('1 selected sender has no safe way');
    const posted = server.calls
      .filter((c) => c.path === '/senders/unsubscribe')
      .map((c) => c.body.address);
    expect(posted).toEqual(['a@x.example', 'c@x.example']);
  });
});

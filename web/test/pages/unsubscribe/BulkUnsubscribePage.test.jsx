import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BulkUnsubscribePage } from '../../../src/pages/unsubscribe/BulkUnsubscribePage.jsx';
import { fakeServer, json, renderPage } from '../../helpers.jsx';

const sender = (address, extra = {}) => ({
  address,
  name: null,
  status: 'NONE',
  emailCount: 12,
  readCount: 3,
  readRate: 0.25,
  lastReceived: '2026-10-01T09:00:00.000Z',
  level: 'SAFE',
  method: 'unsubscribe',
  avatar: { initials: address.charAt(0).toUpperCase(), hue: 10 },
  ...extra,
});

const pickTab = (name) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });

const openMenu = (row) =>
  fireEvent.pointerDown(within(row).getByRole('button', { name: 'More' }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });

describe('BulkUnsubscribePage', () => {
  it('shows unhandled senders with one button each, no risk badge, and runs Unsubscribe', async () => {
    const senders = [
      sender('news@shop.example', { name: 'Shop News' }),
      sender('promo@evil.example', { level: 'DANGEROUS', method: 'report_spam' }),
      sender('digest@club.example', { method: 'block' }),
      sender('old@kept.example', { status: 'KEPT' }),
    ];
    const server = fakeServer({
      'GET /senders': senders,
      'POST /senders/unsubscribe': { status: 'UNSUBSCRIBED', method: 'one_click' },
    });
    renderPage(<BulkUnsubscribePage />, { server });
    await waitFor(() => expect(screen.getByText('Shop News')).toBeTruthy());
    expect(screen.getByText('news@shop.example')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Unsubscribe' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Block' })).toHaveLength(2);
    expect(screen.queryByText('Dangerous')).toBeNull();
    expect(screen.queryByText('Safe')).toBeNull();
    expect(document.querySelector('[data-level]')).toBeNull();
    // The kept sender is under its own tab, not in Unhandled.
    expect(screen.queryByText('old@kept.example')).toBeNull();
    expect(screen.getAllByRole('progressbar', { name: 'Read' })).toHaveLength(3);
    expect(screen.getAllByText('25%')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));
    await waitFor(() =>
      expect(server.calls.find((c) => c.path === '/senders/unsubscribe')?.body).toEqual({
        address: 'news@shop.example',
      }),
    );
    // No outcome line anywhere (PLAN §16): the row and the counts tell the story after refresh.
    await waitFor(() =>
      expect(server.calls.filter((c) => c.path.startsWith('/senders?')).length).toBe(2),
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(/unsubscribed with/)).toBeNull();
    expect(document.querySelector('li.text-danger, [aria-label="Outcomes"]')).toBeNull();
  });

  it('puts a failed unsubscribe in a popover on the button, in plain words, with Block instead (PLAN §16)', async () => {
    const senders = [
      sender('newsletter@pragmaticdesigner.example', { name: 'The Pragmatic Designer' }),
    ];
    const server = fakeServer({
      'GET /senders': senders,
      'GET /senders/block-warning': { warning: null },
      'POST /senders/unsubscribe': json(
        {
          error:
            "The sender's unsubscribe link does not work: its site cannot be reached. Block the sender instead.",
        },
        422,
      ),
      'POST /senders/block': { status: 'BLOCKED', warning: null },
    });
    renderPage(<BulkUnsubscribePage />, { server });
    await waitFor(() => expect(screen.getByText('The Pragmatic Designer')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));
    const popover = await screen.findByRole('dialog', { name: 'Why this did not work' });
    expect(popover.textContent).toContain('its site cannot be reached. Block the sender instead.');
    expect(popover.querySelector('.text-danger')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(within(popover).getByRole('button', { name: 'Block instead' }));
    const dialog = await screen.findByRole('dialog', { name: /Block newsletter@/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Block' }));
    await waitFor(() =>
      expect(server.calls.find((c) => c.path === '/senders/block')?.body).toEqual({
        address: 'newsletter@pragmaticdesigner.example',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('filters with the Unhandled / Kept / All tabs and shows a decided sender as a word', async () => {
    const server = fakeServer({
      'GET /senders': [
        sender('a@x.example'),
        sender('old@kept.example', { status: 'KEPT' }),
        sender('gone@x.example', { status: 'UNSUBSCRIBED' }),
      ],
    });
    renderPage(<BulkUnsubscribePage />, { server });
    await waitFor(() => expect(screen.getByText('a@x.example')).toBeTruthy());
    pickTab(/Kept/);
    await waitFor(() => expect(screen.getByText('old@kept.example')).toBeTruthy());
    expect(screen.queryByText('a@x.example')).toBeNull();
    expect(screen.getByText('kept')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
    pickTab(/All/);
    await waitFor(() => expect(screen.getByText('gone@x.example')).toBeTruthy());
    expect(screen.getByText('unsubscribed')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('keeps with the thumbs-up and offers Archive all and Undo in the overflow menu', async () => {
    const server = fakeServer({
      'GET /senders': [sender('a@x.example'), sender('old@kept.example', { status: 'KEPT' })],
      'POST /senders/keep': { status: 'KEPT' },
      'POST /senders/archive-all': { archived: 7 },
      'POST /senders/undo': { status: 'NONE', note: null },
    });
    renderPage(<BulkUnsubscribePage />, { server });
    await waitFor(() => expect(screen.getByText('a@x.example')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    await waitFor(() =>
      expect(server.calls.find((c) => c.path === '/senders/keep')?.body).toEqual({
        address: 'a@x.example',
      }),
    );
    expect(screen.queryByText(/kept\./)).toBeNull();

    openMenu(screen.getByText('a@x.example').closest('tr'));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Undo' })).toBeNull();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Archive all' }));
    await waitFor(() =>
      expect(server.calls.some((c) => c.path === '/senders/archive-all')).toBe(true),
    );
    expect(screen.queryByText(/archived\./)).toBeNull();

    pickTab(/Kept/);
    await waitFor(() => expect(screen.getByText('old@kept.example')).toBeTruthy());
    openMenu(screen.getByText('old@kept.example').closest('tr'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Undo' }));
    await waitFor(() =>
      expect(server.calls.find((c) => c.path === '/senders/undo')?.body).toEqual({
        address: 'old@kept.example',
      }),
    );
    expect(screen.queryByText(/status reverted/)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('puts the policy warning in the Block tooltip and dialog, and respects Cancel', async () => {
    const server = fakeServer({
      'GET /senders': [sender('no-reply@accounts.google.com', { method: 'block' })],
      'GET /senders/block-warning': {
        warning: 'This looks like a security or account sender.',
      },
      'POST /senders/block': { status: 'BLOCKED', warning: null },
    });
    renderPage(<BulkUnsubscribePage />, { server });
    const block = await screen.findByRole('button', { name: 'Block' });
    fireEvent.focus(block);
    const tip = await screen.findByRole('tooltip');
    await waitFor(() => expect(tip.textContent).toContain('security or account sender'));

    fireEvent.click(block);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Block no-reply@accounts.google.com?');
    expect(dialog.textContent).toContain('security or account sender');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(server.calls.some((c) => c.path === '/senders/block')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Block' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Block' }),
    );
    await waitFor(() => expect(server.calls.some((c) => c.path === '/senders/block')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/blocked\./)).toBeNull();
  });

  it('bulk-unsubscribes only the senders with a safe link, after a dialog with counts', async () => {
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
    renderPage(<BulkUnsubscribePage />, { server });
    await waitFor(() => expect(screen.getByLabelText('Select all')).toBeTruthy());
    expect(screen.queryByRole('toolbar')).toBeNull();
    fireEvent.click(screen.getByLabelText('Select all'));
    const toolbar = screen.getByRole('toolbar', { name: 'Bulk actions' });
    expect(toolbar.textContent).toContain('3 selected');
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Unsubscribe' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Unsubscribe from 2 senders?');
    expect(dialog.textContent).toContain('1 selected sender has no safe way');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unsubscribe' }));
    await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
    const posted = server.calls
      .filter((c) => c.path === '/senders/unsubscribe')
      .map((c) => c.body.address);
    expect(posted).toEqual(['a@x.example', 'c@x.example']);
    // Everything worked: the dialog is gone and nothing is printed.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/done/)).toBeNull();
  });

  it('keeps the bulk dialog open with the senders that failed (PLAN §16)', async () => {
    const server = fakeServer({
      'GET /senders': [sender('a@x.example'), sender('dead@x.example', { name: 'Dead Link' })],
      'POST /senders/unsubscribe': (body) =>
        body.address === 'dead@x.example'
          ? json(
              {
                error:
                  "The sender's unsubscribe page answered with an error. Block the sender instead.",
              },
              422,
            )
          : { status: 'UNSUBSCRIBED', method: 'one_click' },
    });
    renderPage(<BulkUnsubscribePage />, { server });
    await waitFor(() => expect(screen.getByLabelText('Select all')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Select all'));
    fireEvent.click(
      within(screen.getByRole('toolbar')).getByRole('button', { name: 'Unsubscribe' }),
    );
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Unsubscribe' }),
    );
    const report = await screen.findByRole('dialog', { name: '1 of 2 done' });
    expect(report.textContent).toContain(
      "Dead Link: The sender's unsubscribe page answered with an error.",
    );
    expect(within(report).queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(within(report).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says so when the selected senders have no safe unsubscribe link', async () => {
    const server = fakeServer({
      'GET /senders': [sender('promo@evil.example', { method: 'block' })],
    });
    renderPage(<BulkUnsubscribePage />, { server });
    await waitFor(() => expect(screen.getByLabelText('Select all')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Select all'));
    fireEvent.click(
      within(screen.getByRole('toolbar')).getByRole('button', { name: 'Unsubscribe' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Nothing to do' });
    expect(dialog.textContent).toContain(
      '1 selected sender has no safe unsubscribe link. Use Block instead',
    );
    expect(within(dialog).getByRole('button', { name: 'OK' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(server.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('searches by name or address and loads more', async () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      sender(`s${i}@x.example`, { name: i === 3 ? 'Weekly Digest' : null }),
    );
    const server = fakeServer({
      'GET /senders': (body, path) =>
        path.includes('limit=100') ? [...many, sender('extra@x.example')] : many,
    });
    renderPage(<BulkUnsubscribePage />, { server });
    await waitFor(() => expect(screen.getByText('Weekly Digest')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getByText('extra@x.example')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'digest' } });
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Enter' });
    expect(screen.getByRole('heading', { name: 'digest' })).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Weekly Digest')).toBeTruthy();
  });
});

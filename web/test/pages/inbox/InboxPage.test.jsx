import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InboxPage } from '../../../src/pages/inbox/InboxPage.jsx';
import { TABS, queryForTab } from '../../../src/pages/inbox/InboxTabs.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const today = new Date();
today.setHours(9, 0, 0, 0);
const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

const row = (gmailId, extra = {}) => ({
  gmailId,
  fromAddr: 'rahul@acme-corp.com',
  fromName: 'Rahul',
  date: today.toISOString(),
  isRead: false,
  direction: 'inbound',
  subject: 'Quarterly deck',
  snippet: 'Can you send the deck before Friday?',
  summary: 'AI SUMMARY MUST NOT SHOW',
  category: 'work',
  rules: ['to_reply'],
  avatar: { initials: 'R', hue: 10 },
  verdict: { level: 'SAFE', score: 0, injectionAttempt: false, userFeedback: null },
  ...extra,
});

const counts = { all: 3, byRule: { to_reply: 2 }, byLevel: { DANGEROUS: 1 } };

describe('InboxTabs', () => {
  it('has All plus the nine labels, never Suspicious or Dangerous, and maps each to a query', () => {
    expect(TABS.map((tab) => tab.label)).toEqual([
      'All',
      'To reply',
      'Awaiting',
      'FYI',
      'Newsletter',
      'Marketing',
      'Calendar',
      'Receipt',
      'Notification',
      'Cold',
    ]);
    expect(queryForTab('all')).toBe('/emails?limit=50');
    expect(queryForTab('to_reply')).toBe('/emails?limit=50&label=to_reply');
    expect(queryForTab('dangerous')).toBe('/emails?limit=50');
  });
});

describe('InboxPage', () => {
  it('shows quiet tabs with counts and single-line rows under date headings', async () => {
    const server = fakeServer({
      'GET /emails/counts': counts,
      'GET /emails': {
        items: [
          row('a'),
          row('b', {
            fromName: null,
            isRead: true,
            date: yesterday.toISOString(),
            rules: ['newsletter'],
            verdict: { level: 'DANGEROUS', injectionAttempt: true },
          }),
        ],
        nextCursor: null,
      },
    });
    renderPage(<InboxPage />, { server, path: '/inbox', route: '/inbox' });
    await waitFor(() => expect(screen.getByText('Rahul')).toBeTruthy());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Inbox');
    expect(screen.getAllByRole('tab')).toHaveLength(10);
    expect(screen.getByRole('tab', { name: /To reply/ }).textContent).toContain('2');
    expect(screen.getByRole('tab', { name: /All/ }).textContent).toContain('3');
    expect(screen.queryByRole('tab', { name: /Dangerous/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Suspicious/ })).toBeNull();

    const todayGroup = screen.getByRole('region', { name: 'Today' });
    const yesterdayGroup = screen.getByRole('region', { name: 'Yesterday' });
    expect(within(todayGroup).getByText('Rahul')).toBeTruthy();
    expect(within(yesterdayGroup).getByText('rahul@acme-corp.com')).toBeTruthy();
    expect(within(yesterdayGroup).getByLabelText('Dangerous')).toBeTruthy();
    expect(within(todayGroup).queryByLabelText('Dangerous')).toBeNull();
    expect(screen.getByText('To reply', { selector: 'span' }).className).toContain('bg-tag-reply');
    expect(screen.getByText('Newsletter', { selector: 'span' }).className).toContain(
      'bg-tag-newsletter',
    );
    expect(screen.getAllByText('Quarterly deck')).toHaveLength(2);
    expect(document.body.textContent).not.toContain('AI SUMMARY');
    expect(document.body.textContent).not.toContain('Injection');
    expect(document.body.textContent).not.toMatch(/\bSafe\b/);
  });

  it('switches tab through the query string and loads more pages', async () => {
    const server = fakeServer({
      'GET /emails/counts': { all: 0, byRule: {}, byLevel: {} },
      'GET /emails': (body, path) => {
        if (path.includes('label=fyi'))
          return { items: [row('fyi-1', { subject: 'FYI only' })], nextCursor: null };
        if (path.includes('cursor=')) return { items: [row('p2')], nextCursor: null };
        return { items: [row('p1')], nextCursor: 'next' };
      },
    });
    renderPage(<InboxPage />, { server, path: '/inbox', route: '/inbox' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getAllByText('Quarterly deck')).toHaveLength(2));
    fireEvent.mouseDown(screen.getByRole('tab', { name: /FYI/ }), { button: 0 });
    await waitFor(() => expect(screen.getByText('FYI only')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(server.calls.some((call) => call.path === '/emails?limit=50&label=fyi')).toBe(true);
  });

  it('opens the search line with /, shows the query as the title and highlights matches', async () => {
    const server = fakeServer({
      'GET /emails/counts': counts,
      'GET /emails': { items: [row('a')], nextCursor: null },
      'GET /search': {
        query: 'deck',
        items: [row('s1', { subject: 'Deck v2', snippet: 'the deck is attached' })],
        nextCursor: null,
      },
    });
    renderPage(<InboxPage />, { server, path: '/inbox', route: '/inbox' });
    await waitFor(() => expect(screen.getByText('Rahul')).toBeTruthy());
    fireEvent.keyDown(document.body, { key: '/' });
    const input = screen.getByRole('searchbox', { name: 'Search' });
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'deck' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText(/v2/)).toBeTruthy());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('deck');
    expect(screen.queryByRole('tab')).toBeNull();
    expect(server.calls.some((call) => call.path === '/search?q=deck')).toBe(true);
    expect([...document.querySelectorAll('mark')].map((m) => m.textContent)).toEqual([
      'Deck',
      'deck',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Inbox'),
    );
    expect(screen.getAllByRole('tab')).toHaveLength(10);
  });

  it('archives from the hover actions, drops the row and reports in one quiet line', async () => {
    const server = fakeServer({
      'GET /emails/counts': counts,
      'GET /emails': { items: [row('a'), row('b', { subject: 'Keep me' })], nextCursor: null },
      'POST /emails/a/archive': { gmailId: 'a', done: true, decision: 'ALLOW', reason: 'ok' },
      'POST /emails/b/draft-reply': (body) =>
        body.allowSuspicious
          ? { draftId: 'd' }
          : new Response(JSON.stringify({ error: 'This email is SUSPICIOUS' }), {
              status: 403,
              headers: { 'content-type': 'application/json' },
            }),
    });
    renderPage(<InboxPage />, { server, path: '/inbox', route: '/inbox' });
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Archive' })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: 'Archive' })[0]);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Archived.'));
    expect(screen.queryByText('Quarterly deck')).toBeNull();
    expect(screen.getByText('Keep me')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('This email is SUSPICIOUS'),
    );
    expect(screen.getByRole('status').className).toContain('text-danger');
  });

  it('opens an email in the main column and comes back to the same tab', async () => {
    const server = fakeServer({
      'GET /emails/counts': counts,
      'GET /emails': { items: [row('a')], nextCursor: null },
      'GET /emails/a': {
        email: row('a'),
        verdict: row('a').verdict,
        readerForm: null,
        signals: [],
        rules: [],
        sender: { trusted: false, sentCount: 1, receivedCount: 1 },
      },
      'GET /emails/a/content': {
        gmailId: 'a',
        subject: 'Quarterly deck',
        from: { name: 'Rahul', address: 'rahul@acme-corp.com' },
        to: [],
        cc: [],
        text: 'Hi',
        links: [],
        hidden: [],
        attachments: [],
        html: null,
      },
    });
    renderPage(<InboxPage />, { server, path: '/inbox?tab=to_reply', route: '/inbox/:gmailId?' });
    await waitFor(() => expect(screen.getByText('Rahul')).toBeTruthy());
    fireEvent.click(screen.getByText('Quarterly deck'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    expect(screen.queryByRole('tablist', { name: 'Inbox tabs' })).toBeNull();
    expect(screen.getByRole('article')).toBeTruthy();
  });
});

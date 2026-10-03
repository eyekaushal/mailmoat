import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InboxPage } from '../../../src/pages/inbox/InboxPage.jsx';
import { queryForTab } from '../../../src/pages/inbox/LabelTabs.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const row = (gmailId, extra = {}) => ({
  gmailId,
  fromAddr: 'rahul@acme-corp.com',
  fromName: 'Rahul',
  date: '2026-10-02T09:00:00.000Z',
  isRead: false,
  direction: 'inbound',
  summary: 'Asks about Friday.',
  category: 'work',
  rules: ['to_reply'],
  verdict: { level: 'SAFE', score: 0, injectionAttempt: false, userFeedback: null },
  ...extra,
});

describe('queryForTab', () => {
  it('maps tabs to the list query', () => {
    expect(queryForTab('all')).toBe('/emails?limit=50');
    expect(queryForTab('to_reply')).toBe('/emails?limit=50&label=to_reply');
    expect(queryForTab('dangerous')).toBe('/emails?limit=50&risk=DANGEROUS');
    expect(queryForTab('nope')).toBe('/emails?limit=50');
  });
});

describe('InboxPage', () => {
  it('shows the tabs with counts and the list rows with sender, summary and badges', async () => {
    const server = fakeServer({
      'GET /emails/counts': { all: 3, byRule: { to_reply: 2 }, byLevel: { DANGEROUS: 1 } },
      'GET /emails': {
        items: [
          row('a'),
          row('b', {
            fromName: null,
            isRead: true,
            verdict: { level: 'DANGEROUS', injectionAttempt: true },
          }),
        ],
        nextCursor: null,
      },
    });
    renderPage(<InboxPage />, { server, path: '/inbox', route: '/inbox' });
    await waitFor(() => expect(screen.getByText('Rahul')).toBeTruthy());
    expect(screen.getByRole('tab', { name: /To Reply/ }).textContent).toContain('2');
    expect(screen.getByRole('tab', { name: /Dangerous/ }).textContent).toContain('1');
    expect(screen.getAllByText('Asks about Friday.')).toHaveLength(2);
    expect(screen.getByText('rahul@acme-corp.com')).toBeTruthy();
    expect(screen.getByText('Dangerous', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('Injection attempt')).toBeTruthy();
    expect(screen.getAllByLabelText('AI summary of an untrusted email')).toHaveLength(2);
  });

  it('switches tab through the query string and loads more pages', async () => {
    const server = fakeServer({
      'GET /emails/counts': { all: 0, byRule: {}, byLevel: {} },
      'GET /emails': (body, path) => {
        if (path.includes('label=fyi'))
          return { items: [row('fyi-1', { summary: 'FYI only.' })], nextCursor: null };
        if (path.includes('cursor=')) return { items: [row('p2')], nextCursor: null };
        return { items: [row('p1')], nextCursor: 'next' };
      },
    });
    renderPage(<InboxPage />, { server, path: '/inbox', route: '/inbox' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load more' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getAllByText('Asks about Friday.')).toHaveLength(2));
    fireEvent.click(screen.getByRole('tab', { name: /FYI/ }));
    await waitFor(() => expect(screen.getByText('FYI only.')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});

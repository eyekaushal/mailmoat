import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReadingView, defaultExpanded } from '../../../src/pages/inbox/ReadingView.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const now = new Date(2026, 9, 5, 12, 0, 0);
const SAFE = { level: 'SAFE', score: 0, injectionAttempt: false, userFeedback: null };
const SUSPICIOUS = { level: 'SUSPICIOUS', score: 45, injectionAttempt: false, userFeedback: null };
const DANGEROUS = { level: 'DANGEROUS', score: 90, injectionAttempt: true, userFeedback: null };

const detail = (overrides = {}) => ({
  email: {
    gmailId: 'a',
    threadId: 't1',
    direction: 'inbound',
    fromAddr: 'rahul@acme-corp.com',
    fromName: 'Rahul Mehta',
    date: new Date(2026, 9, 5, 9, 12).toISOString(),
    isRead: false,
  },
  verdict: SAFE,
  readerForm: {
    category: 'work',
    needs_reply: true,
    intents: {},
    summary: 'Rahul shares the launch deck <img src=x> and asks for a review.',
    meeting_request: null,
  },
  signals: [],
  rules: [{ ruleId: 'to_reply', actionsTaken: ['label'], status: 'done' }],
  sender: { trusted: false, sentCount: 0, receivedCount: 1 },
  ...overrides,
});

const rahul = { name: 'Rahul Mehta', address: 'rahul@acme-corp.com' };
const message = (gmailId, extra = {}) => ({
  gmailId,
  direction: 'inbound',
  date: new Date(2026, 9, 3, 9, 0).toISOString(),
  isRead: true,
  verdict: SAFE,
  unreadable: false,
  subject: 'Launch deck',
  from: rahul,
  to: [{ name: null, address: 'kaushal@gmail.com' }],
  cc: [],
  text: `Message ${gmailId} body.`,
  textTruncated: false,
  links: [],
  attachments: [],
  avatar: { initials: 'RM', hue: 20 },
  ...extra,
});

const thread = (last = {}) => ({
  threadId: 't1',
  messages: [
    message('m1', { text: 'First note about the deck.' }),
    message('m2', {
      direction: 'outbound',
      verdict: null,
      from: { name: null, address: 'kaushal@gmail.com' },
      subject: 'Re: Launch deck',
      text: 'Thanks, looking now.',
    }),
    message('a', {
      date: new Date(2026, 9, 5, 9, 12).toISOString(),
      isRead: false,
      text: 'Here is the final deck. <b>bold</b>',
      links: [{ href: 'https://acme-corp.com/deck', text: 'the deck', host: 'acme-corp.com' }],
      ...last,
    }),
  ],
});

function open(routes, props = {}) {
  const server = fakeServer({
    'GET /emails/a': detail(),
    'GET /threads/t1': thread(),
    ...routes,
  });
  const onClose = vi.fn();
  const view = renderPage(<ReadingView gmailId="a" onClose={onClose} now={now} {...props} />, {
    server,
  });
  return { server, onClose, ...view };
}

describe('ReadingView', () => {
  it('shows subject, one category tag, the conversation with earlier messages collapsed, and the labelled summary on the opened one', async () => {
    const { container } = open();
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Launch deck'),
    );
    expect(screen.getByText('To reply')).toBeTruthy();
    expect(screen.queryByText('work')).toBeNull();
    expect(screen.queryByText(/Suspicious|Dangerous|Not checked/)).toBeNull();
    expect(screen.queryByText('Why was this flagged?')).toBeNull();

    const list = screen.getByRole('list', { name: 'Conversation' });
    expect(list.querySelectorAll(':scope > li')).toHaveLength(3);
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(2);
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1);
    expect(screen.getByText('Here is the final deck. <b>bold</b>')).toBeTruthy();
    expect(screen.getByText('AI summary')).toBeTruthy();
    expect(
      screen.getByText('Rahul shares the launch deck <img src=x> and asks for a review.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /acme-corp\.com/ })).toBeTruthy();

    // Removed in the redesign: banner, View original and its iframe, "never written", footer bar.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/View original/)).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.queryByText(/never written to this sender/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Draft reply/ })).toBeNull();
    expect(container.querySelector('footer')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { expanded: false })[0]);
    expect(screen.getByText('First note about the deck.')).toBeTruthy();
    expect(screen.queryAllByText('AI summary')).toHaveLength(1);
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { expanded: true })[0]);
    expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1);
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(2);
  });

  it('expands the newest message and the opened one by default', () => {
    const messages = [{ gmailId: 'x' }, { gmailId: 'y' }, { gmailId: 'z' }];
    expect([...defaultExpanded(messages, 'x')]).toEqual(['z', 'x']);
    expect([...defaultExpanded(messages, 'z')]).toEqual(['z']);
    expect([...defaultExpanded([], 'z')]).toEqual(['z']);
  });

  it('wears the risk word once on dangerous mail, turns Reply off, and explains why on request', async () => {
    const dangerous = detail({ verdict: DANGEROUS, rules: [] });
    const { server } = open({
      'GET /emails/a': dangerous,
      'GET /threads/t1': thread({
        verdict: DANGEROUS,
        links: [{ href: 'https://evil.example/x', text: 'bank.com', host: 'evil.example' }],
      }),
      'GET /emails/a/trace': {
        gmailId: 'a',
        direction: 'inbound',
        auth: { dmarc: 'fail' },
        signals: [{ id: 'S1', severity: 'high', reason: 'DMARC failed' }],
        reader: { failed: false, form: dangerous.readerForm },
        verdict: { ...DANGEROUS, floor: 'DANGEROUS', reasons: ['BEC'] },
        rules: [],
        events: [],
      },
      'POST /emails/a/not-phishing': { gmailId: 'a', verdict: DANGEROUS },
    });
    await waitFor(() => expect(screen.getByText('Dangerous')).toBeTruthy());
    expect(screen.getAllByText('Dangerous')).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('.bg-danger-soft')).toBeNull();
    const reply = screen.getByRole('button', { name: /Replies are never drafted/ });
    expect(reply.disabled).toBe(true);
    expect(screen.queryByRole('link', { name: /evil\.example/ })).toBeNull();
    expect(screen.getByText('evil.example')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'r' });
    expect(server.calls.some((c) => c.path === '/emails/a/draft-reply')).toBe(false);

    fireEvent.click(screen.getByText('Why was this flagged?'));
    await waitFor(() => expect(screen.getByText('dmarc')).toBeTruthy());
    expect(screen.getByText('DMARC failed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Report as not phishing' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/not phishing/));
    expect(server.calls.find((c) => c.path === '/emails/a/not-phishing').body).toEqual({
      notPhishing: true,
    });
  });

  it('asks before drafting from suspicious mail, drafts with r, archives with e and goes back', async () => {
    const { server, onClose } = open({
      'GET /emails/a': detail({ verdict: SUSPICIOUS }),
      'GET /threads/t1': thread({ verdict: SUSPICIOUS }),
      'POST /emails/a/draft-reply': { gmailId: 'a', draftId: 'd1' },
      'POST /emails/a/archive': { gmailId: 'a', done: true, decision: 'ALLOW', reason: 'ok' },
    });
    await waitFor(() => expect(screen.getByText('Suspicious')).toBeTruthy());
    expect(screen.getByText('Why was this flagged?')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'r' });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Reply to a suspicious email?');
    fireEvent.click(screen.getByRole('button', { name: 'Draft anyway' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Draft saved in Gmail Drafts'),
    );
    expect(server.calls.find((c) => c.path === '/emails/a/draft-reply').body).toEqual({
      allowSuspicious: true,
    });

    fireEvent.keyDown(window, { key: 'e' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(server.calls.some((c) => c.path === '/emails/a/archive')).toBe(true);
  });

  it('ignores shortcuts while typing and reports a refused archive in place', async () => {
    const { server, onClose } = open({
      'POST /emails/a/archive': { gmailId: 'a', done: false, decision: 'DENY', reason: 'Nope' },
    });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    const input = document.createElement('input');
    document.body.append(input);
    fireEvent.keyDown(input, { key: 'e' });
    expect(server.calls.some((c) => c.path === '/emails/a/archive')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Not archived: Nope'));
    expect(onClose).not.toHaveBeenCalled();
    input.remove();
  });

  it('marks the sender trusted from the title row', async () => {
    const { server } = open({
      'POST /emails/a/trust-sender': (body) => ({
        address: 'rahul@acme-corp.com',
        trusted: body.trusted,
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Mark sender trusted' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('risk levels never go down'),
    );
    expect(server.calls.find((c) => c.path === '/emails/a/trust-sender').body).toEqual({
      trusted: true,
    });
    expect(screen.getByRole('button', { name: 'Ask AI about this email' })).toBeTruthy();
  });

  it('offers Propose meeting only when times were found and saves the card', async () => {
    const { server, rerender } = open({
      'GET /emails/a': detail({
        readerForm: {
          category: 'calendar',
          needs_reply: true,
          intents: {},
          summary: 'Meet Friday?',
          meeting_request: { proposed_times: ['2026-10-09T17:00:00+05:30'] },
        },
      }),
      'POST /emails/a/propose-meeting': {
        gmailId: 'a',
        level: 'SAFE',
        timeZone: 'Asia/Kolkata',
        durationMinutes: 30,
        title: 'Meeting with Rahul',
        description: 'Proposed in an email.',
        attendees: ['rahul@acme-corp.com'],
        proposed: [
          { start: '2026-10-09T11:30:00.000Z', end: '2026-10-09T12:00:00.000Z', free: true },
        ],
        chosen: { start: '2026-10-09T11:30:00.000Z', end: '2026-10-09T12:00:00.000Z' },
        alternatives: [],
      },
      'POST /emails/a/save-meeting': { approvalId: 'ap', eventId: 'e1', link: 'https://cal/x' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Propose meeting' }));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Meeting proposal' })).toBeTruthy(),
    );
    expect(server.calls.find((c) => c.path === '/emails/a/propose-meeting').body).toEqual({
      allowRisky: false,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save to Calendar' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Event created'));
    expect(screen.queryByRole('region', { name: 'Meeting proposal' })).toBeNull();
    void rerender;
  });

  it('has no Propose meeting when the Reader found no times', async () => {
    open();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Propose meeting/ })).toBeNull();
  });
});

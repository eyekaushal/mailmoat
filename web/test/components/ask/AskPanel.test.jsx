import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AskAiProvider } from '../../../src/components/ask/AskAiProvider.jsx';
import { AskPanel, HEADING, PROMPT, SUGGESTIONS } from '../../../src/components/ask/AskPanel.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

function sseResponse(blocks) {
  const text = blocks
    .map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const card = {
  approvalId: 'ap1',
  kind: 'event',
  tool: 'create_calendar_event',
  reason: 'Calendar events need your approval.',
  fields: {
    title: { value: 'Launch strategy', sources: [{ type: 'user' }] },
    start: {
      value: '2026-10-10T15:00:00+05:30',
      sources: [
        { type: 'email', id: 'g1', from: 'bookings@indigo.example', date: '2026-10-01T09:00:00Z' },
      ],
    },
  },
};

const mount = (server) =>
  renderPage(
    <AskAiProvider>
      <AskPanel />
    </AskAiProvider>,
    { server },
  );

const openMenu = () =>
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Recent chats' }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });

describe('AskPanel', () => {
  it('starts with the centred question and suggestion chips that fill the composer', async () => {
    mount(fakeServer({ 'GET /chats': [] }));
    expect(screen.getByRole('heading', { name: HEADING })).toBeTruthy();
    expect(screen.getByPlaceholderText(PROMPT)).toBeTruthy();
    const chips = within(screen.getByRole('list', { name: 'Suggestions' })).getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual(SUGGESTIONS);
    fireEvent.click(chips[0]);
    expect(screen.getByLabelText('Message').value).toBe(SUGGESTIONS[0]);
    expect(screen.getByRole('button', { name: 'Send' }).disabled).toBe(false);
  });

  it('streams a turn: the progress line, an email list from the inbox API, a card with its source, then the stored answer', async () => {
    let stored = null;
    const server = fakeServer({
      'GET /emails': {
        items: [
          {
            gmailId: 'g1',
            fromName: 'IndiGo',
            fromAddr: 'bookings@indigo.example',
            subject: 'Your flight <img src=x>',
            snippet: '',
            date: '2026-10-01T09:00:00Z',
            verdict: null,
            avatar: { initials: 'I', hue: 1 },
          },
        ],
        nextCursor: null,
      },
      'GET /chats': () =>
        stored
          ? [{ id: 'c1', title: 'Find time with Mia', createdAt: '2026-10-03T08:00:00Z' }]
          : [],
      'GET /chats/c1': () => ({ id: 'c1', title: 'Find time with Mia', messages: stored }),
      'POST /chat': (body) => {
        stored = [
          {
            id: 1,
            role: 'user',
            content: { text: body.message },
            createdAt: '2026-10-03T08:00:00Z',
          },
          {
            id: 2,
            role: 'assistant',
            content: {
              text: 'Here is the event. Save it when it looks right.',
              progress: 'Finding the best time for everyone…',
              intent: 'schedule',
              status: 'pending',
              steps: [
                { step: 1, tool: 'search_emails', label: 'Searching inbox…', status: 'done' },
              ],
              cards: [card],
              results: [
                {
                  step: 1,
                  tool: 'search_emails',
                  kind: 'emails',
                  value: { count: 1, ids: ['g1'], senders: ['bookings@indigo.example'] },
                  untrusted: true,
                  sources: [{ type: 'email', id: 'g1', from: 'bookings@indigo.example' }],
                },
              ],
            },
            createdAt: '2026-10-03T08:00:01Z',
          },
        ];
        return sseResponse([
          ['chat', { type: 'chat', chatId: 'c1' }],
          ['chat', { type: 'status', text: 'Planning…' }],
          ['chat', { type: 'status', text: 'Finding the best time for everyone…' }],
          [
            'chat',
            {
              type: 'step',
              step: 1,
              tool: 'search_emails',
              label: 'Searching inbox…',
              status: 'running',
            },
          ],
          [
            'chat',
            {
              type: 'step',
              step: 1,
              tool: 'search_emails',
              label: 'Searching inbox…',
              status: 'done',
            },
          ],
          [
            'chat',
            {
              type: 'result',
              step: 1,
              tool: 'search_emails',
              kind: 'emails',
              value: { count: 1, ids: ['g1'], senders: ['bookings@indigo.example'] },
              untrusted: true,
              sources: [],
            },
          ],
          ['chat', { type: 'card', card }],
          ['chat', { type: 'message', text: 'Here is the event. Save it when it looks right.' }],
          ['done', { chatId: 'c1', content: {} }],
        ]);
      },
    });
    mount(server);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Find time with Mia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(screen.getByText('Here is the event. Save it when it looks right.')).toBeTruthy(),
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Find time with Mia' })).toBeTruthy(),
    );
    expect(screen.queryByText(HEADING)).toBeNull();
    // The stored turn: no progress line, no steps, no raw data; the list rows come from /emails.
    expect(screen.queryByText('Finding the best time for everyone…')).toBeNull();
    expect(screen.queryByText('Searching inbox…')).toBeNull();
    const list = await screen.findByRole('list', { name: 'Emails' });
    expect(list.textContent).toContain('IndiGo');
    expect(list.textContent).toContain('Your flight <img src=x>');
    expect(document.querySelector('img')).toBeNull();
    expect(document.body.textContent).not.toContain('{');
    // The event reads like an invitation: its title, when, and where the time came from.
    expect(screen.getByRole('heading', { name: 'Launch strategy' })).toBeTruthy();
    expect(screen.getByText('From email from bookings@indigo.example on 2026-10-01')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(server.calls.find((c) => c.path === '/chat').body).toEqual({
      message: 'Find time with Mia',
    });
    expect(server.calls.some((c) => c.path === '/emails?ids=g1')).toBe(true);
  });

  it('edits a card before approval: the change is saved on the approval and becomes your own words', async () => {
    const messages = [
      { id: 1, role: 'user', content: { text: 'Schedule it' } },
      {
        id: 2,
        role: 'assistant',
        content: {
          text: 'Here is the event.',
          status: 'pending',
          steps: [],
          cards: [card],
          results: [],
        },
      },
    ];
    const server = fakeServer({
      'GET /chats': [{ id: 'c1', title: 'Schedule it', createdAt: '2026-10-03T08:00:00Z' }],
      'GET /chats/c1': { id: 'c1', title: 'Schedule it', messages },
      'PATCH /approvals/ap1': (body) => ({ id: 'ap1', args: body }),
    });
    mount(server);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recent chats' })).toBeTruthy());
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Schedule it' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Launch strategy sync' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Launch strategy sync' })).toBeTruthy(),
    );
    expect(
      server.calls.find((c) => c.method === 'PATCH' && c.path === '/approvals/ap1').body,
    ).toEqual({ title: 'Launch strategy sync' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('opens a recent chat from the menu, decides on its card and deletes it after a dialog', async () => {
    const messages = [
      { id: 1, role: 'user', content: { text: 'Schedule it' } },
      {
        id: 2,
        role: 'assistant',
        content: {
          text: 'Proposal ready.',
          status: 'pending',
          steps: [],
          cards: [card],
          results: [],
        },
      },
    ];
    let chats = [{ id: 'c1', title: 'Schedule it', createdAt: '2026-10-03T08:00:00Z' }];
    const server = fakeServer({
      'GET /chats': () => chats,
      'GET /chats/c1': () => ({ id: 'c1', title: 'Schedule it', messages }),
      'POST /chats/c1/decide': (body) => {
        messages.push({
          id: 3,
          role: 'assistant',
          content: {
            status: 'performed',
            text: 'Done! Your meeting is scheduled for Sat 10 Oct, 15:00.',
            approvalId: body.approvalId,
            steps: [],
            cards: [],
          },
        });
        return { status: 'performed' };
      },
      'DELETE /chats/c1': () => {
        chats = [];
        return { deleted: true };
      },
    });
    mount(server);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recent chats' })).toBeTruthy());
    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Schedule it' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        screen.getByText('Done! Your meeting is scheduled for Sat 10 Oct, 15:00.'),
      ).toBeTruthy(),
    );
    expect(server.calls.find((c) => c.path === '/chats/c1/decide').body).toEqual({
      approvalId: 'ap1',
      action: 'approve',
    });
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete this chat' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText(HEADING)).toBeTruthy());
    expect(server.calls.some((c) => c.method === 'DELETE' && c.path === '/chats/c1')).toBe(true);
  });

  it('shows a stream error in place, and the New chat and Close controls', async () => {
    const server = fakeServer({
      'GET /chats': [],
      'POST /chat': () =>
        sseResponse([
          ['chat', { type: 'chat', chatId: 'c9' }],
          ['error', { message: 'Anthropic key missing' }],
        ]),
      'GET /chats/c9': { id: 'c9', title: null, messages: [] },
    });
    mount(server);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hello' } });
    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Enter' });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Anthropic key missing'),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'New chat' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Close Ask AI' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(screen.getByText(HEADING)).toBeTruthy();
  });
});

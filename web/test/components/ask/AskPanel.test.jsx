import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AskAiProvider } from '../../../src/components/ask/AskAiProvider.jsx';
import { AskPanel, PROMPT, SUGGESTIONS } from '../../../src/components/ask/AskPanel.jsx';
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
  it('starts with the centred prompt and suggestion chips that fill the composer', async () => {
    mount(fakeServer({ 'GET /chats': [] }));
    expect(screen.getByText(PROMPT)).toBeTruthy();
    const chips = within(screen.getByRole('list', { name: 'Suggestions' })).getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual(SUGGESTIONS);
    fireEvent.click(chips[0]);
    expect(screen.getByLabelText('Message').value).toBe(SUGGESTIONS[0]);
    expect(screen.getByRole('button', { name: 'Send' }).disabled).toBe(false);
  });

  it('streams a turn: steps, untrusted results, a card with its source, then the stored chat with numbered sources', async () => {
    let stored = null;
    const server = fakeServer({
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
              text: 'Here is a proposal.',
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
                  value: [
                    { from: { address: 'bookings@indigo.example' }, summary: 'Flight <img src=x>' },
                  ],
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
              value: [],
              untrusted: true,
              sources: [],
            },
          ],
          ['chat', { type: 'card', card }],
          ['chat', { type: 'message', text: 'Here is a proposal.' }],
          ['done', { chatId: 'c1', content: {} }],
        ]);
      },
    });
    mount(server);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Find time with Mia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('Here is a proposal.')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Find time with Mia' })).toBeTruthy(),
    );
    expect(screen.queryByText(PROMPT)).toBeNull();
    expect(screen.getByText('Searching inbox…')).toBeTruthy();
    expect(screen.getByText(/from untrusted email content/)).toBeTruthy();
    expect(screen.getByText(/Flight <img src=x>/)).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Calendar event')).toBeTruthy();
    expect(screen.getByText('From email from bookings@indigo.example on 2026-10-01')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Sources' }).textContent).toContain(
      '1.email from bookings@indigo.example',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(server.calls.find((c) => c.path === '/chat').body).toEqual({
      message: 'Find time with Mia',
    });
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
            text: 'Done: event created.',
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
    await waitFor(() => expect(screen.getByText('Done: event created.')).toBeTruthy());
    expect(server.calls.find((c) => c.path === '/chats/c1/decide').body).toEqual({
      approvalId: 'ap1',
      action: 'approve',
    });
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    openMenu();
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete this chat' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText(PROMPT)).toBeTruthy());
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
    expect(screen.getByText(PROMPT)).toBeTruthy();
  });
});

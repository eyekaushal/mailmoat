import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatPage, applyEvent } from '../../../src/pages/chat/ChatPage.jsx';
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
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
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
    attendees: { value: ['mia@example.com', 'amy@example.com'], sources: [{ type: 'user' }] },
  },
};

describe('applyEvent', () => {
  it('folds streamed events into the live turn', () => {
    let turn = { text: '', steps: [], cards: [], results: [], statusText: '' };
    turn = applyEvent(turn, { type: 'status', text: 'Planning…' });
    turn = applyEvent(turn, {
      type: 'step',
      step: 1,
      tool: 'search_emails',
      label: 'Searching inbox…',
      status: 'running',
    });
    turn = applyEvent(turn, {
      type: 'step',
      step: 1,
      tool: 'search_emails',
      label: 'Searching inbox…',
      status: 'done',
    });
    turn = applyEvent(turn, {
      type: 'result',
      step: 1,
      tool: 'search_emails',
      value: [],
      untrusted: true,
    });
    turn = applyEvent(turn, { type: 'card', card });
    turn = applyEvent(turn, { type: 'message', text: 'Here is a proposal.' });
    expect(turn.steps).toEqual([
      { type: 'step', step: 1, tool: 'search_emails', label: 'Searching inbox…', status: 'done' },
    ]);
    expect(turn.results).toHaveLength(1);
    expect(turn.cards).toEqual([card]);
    expect(turn.text).toBe('Here is a proposal.');
    expect(turn.statusText).toBe('');
  });
});

describe('ChatPage', () => {
  it('streams a turn: steps, untrusted results, a card with its email source, then the stored chat', async () => {
    let stored = null;
    const server = fakeServer({
      'GET /chats': () =>
        stored
          ? [{ id: 'c1', title: 'Find time with Mia', createdAt: '2026-10-03T08:00:00Z' }]
          : [],
      'GET /chats/c1': () => ({
        id: 'c1',
        title: 'Find time with Mia',
        createdAt: '2026-10-03T08:00:00Z',
        messages: stored,
      }),
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
                    {
                      from: { address: 'bookings@indigo.example' },
                      date: '2026-10-01',
                      risk: { level: 'SAFE' },
                      summary: 'Flight 6E 123 <img src=x> departs 10:00.',
                    },
                  ],
                  untrusted: true,
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
              value: [
                {
                  from: { address: 'bookings@indigo.example' },
                  date: '2026-10-01',
                  risk: { level: 'SAFE' },
                  summary: 'Flight 6E 123 <img src=x> departs 10:00.',
                },
              ],
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
    renderPage(<ChatPage />, { server, path: '/chat', route: '/chat/:chatId?' });
    await screen.findByText('Ask mailmoat');
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Find time with Mia after my flight' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('Here is a proposal.')).toBeTruthy());
    expect(screen.getByText('Find time with Mia after my flight')).toBeTruthy();
    expect(screen.getByText('Searching inbox…')).toBeTruthy();
    expect(screen.getByText(/from untrusted email content/)).toBeTruthy();
    expect(screen.getByText(/Flight 6E 123 <img src=x> departs 10:00\./)).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Calendar event')).toBeTruthy();
    expect(screen.getByText('From email from bookings@indigo.example on 2026-10-01')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(server.calls.find((c) => c.path === '/chat').body).toEqual({
      message: 'Find time with Mia after my flight',
    });
  });

  it('decides on a stored card through the chat and hides its buttons afterwards', async () => {
    const messages = [
      { id: 1, role: 'user', content: { text: 'Schedule it' }, createdAt: '2026-10-03T08:00:00Z' },
      {
        id: 2,
        role: 'assistant',
        content: {
          text: 'Proposal ready.',
          intent: 'schedule',
          status: 'pending',
          steps: [],
          cards: [card],
          results: [],
        },
        createdAt: '2026-10-03T08:00:01Z',
      },
    ];
    const server = fakeServer({
      'GET /chats': [{ id: 'c1', title: 'Schedule it', createdAt: '2026-10-03T08:00:00Z' }],
      'GET /chats/c1': () => ({
        id: 'c1',
        title: 'Schedule it',
        createdAt: '2026-10-03T08:00:00Z',
        messages,
      }),
      'POST /chats/c1/decide': (body) => {
        messages.push({
          id: 3,
          role: 'assistant',
          content: {
            status: 'performed',
            text: 'Done: event created and invitations sent.',
            approvalId: body.approvalId,
            intent: 'none',
            steps: [],
            cards: [],
            results: [],
          },
          createdAt: '2026-10-03T08:01:00Z',
        });
        return { status: 'performed', text: 'Done: event created and invitations sent.' };
      },
    });
    renderPage(<ChatPage />, { server, path: '/chat/c1', route: '/chat/:chatId' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.getByText('Done: event created and invitations sent.')).toBeTruthy(),
    );
    expect(server.calls.find((c) => c.path === '/chats/c1/decide').body).toEqual({
      approvalId: 'ap1',
      action: 'approve',
    });
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('shows a stream error without losing the page', async () => {
    const server = fakeServer({
      'GET /chats': [],
      'POST /chat': () =>
        sseResponse([
          ['chat', { type: 'chat', chatId: 'c9' }],
          ['error', { message: 'Anthropic key missing' }],
        ]),
      'GET /chats/c9': { id: 'c9', title: null, createdAt: '', messages: [] },
    });
    renderPage(<ChatPage />, { server, path: '/chat', route: '/chat/:chatId?' });
    await screen.findByText('Ask mailmoat');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Anthropic key missing'),
    );
  });
});

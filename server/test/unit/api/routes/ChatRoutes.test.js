import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatRoutes } from '../../../../src/api/routes/ChatRoutes.js';
import { ChatError } from '../../../../src/core/errors.js';
import { startApi } from '../../../helpers/apiServer.js';

let api;
let chats;
let sent;

/** Parses an SSE body into [{ event, data }]. */
function events(text) {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)[1];
      const data = JSON.parse(/^data: (.*)$/m.exec(block)[1]);
      return { event, data };
    });
}

beforeEach(async () => {
  sent = [];
  const store = new Map([['c1', { id: 'c1', title: 'Old', createdAt: 't0' }]]);
  chats = {
    create: () => {
      const chat = { id: `c${store.size + 1}`, title: null, createdAt: 't1' };
      store.set(chat.id, chat);
      return chat;
    },
    list: () => [...store.values()],
    messages: (id) => [{ id: 1, role: 'user', content: { text: `hello ${id}` }, createdAt: 't' }],
    delete: (id) => store.delete(id),
    send: async ({ chatId, message, emailId, onEvent }) => {
      sent.push({ chatId, message, emailId });
      if (!store.has(chatId)) throw new ChatError('Unknown chat');
      onEvent({ type: 'status', text: 'Planning…' });
      onEvent({
        type: 'step',
        step: 1,
        tool: 'search_emails',
        label: 'Searching inbox…',
        status: 'done',
      });
      onEvent({ type: 'card', card: { approvalId: 'a1', kind: 'email' } });
      return {
        text: 'Found it',
        intent: 'find',
        status: 'completed',
        steps: [],
        cards: [],
        results: [],
      };
    },
    decide: async ({ chatId, approvalId, action }) => ({
      status: action === 'approve' ? 'performed' : 'rejected',
      text: `${chatId}:${approvalId}`,
    }),
  };
  api = await startApi({ routes: [new ChatRoutes({ chats })] });
});

afterEach(() => api.close());

describe('ChatRoutes', () => {
  it('lists, creates, reads and deletes chats', async () => {
    expect((await api.get('/api/chats')).json).toEqual([
      { id: 'c1', title: 'Old', createdAt: 't0' },
    ]);
    const created = await api.post('/api/chats');
    expect(created.status).toBe(201);
    expect(created.json).toEqual({ id: 'c2', title: null, createdAt: 't1' });
    expect((await api.get('/api/chats/c1')).json).toEqual({
      id: 'c1',
      title: 'Old',
      createdAt: 't0',
      messages: [{ id: 1, role: 'user', content: { text: 'hello c1' }, createdAt: 't' }],
    });
    expect((await api.get('/api/chats/zz')).status).toBe(404);
    expect((await api.delete('/api/chats/c1')).status).toBe(204);
    expect((await api.delete('/api/chats/c1')).status).toBe(404);
  });

  it('streams a turn as Server-Sent Events and ends with the stored content', async () => {
    const res = await api.post('/api/chat', {
      chatId: 'c1',
      message: 'find the flight',
      emailId: 'e1',
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(events(res.text)).toEqual([
      { event: 'chat', data: { type: 'chat', chatId: 'c1' } },
      { event: 'chat', data: { type: 'status', text: 'Planning…' } },
      {
        event: 'chat',
        data: {
          type: 'step',
          step: 1,
          tool: 'search_emails',
          label: 'Searching inbox…',
          status: 'done',
        },
      },
      { event: 'chat', data: { type: 'card', card: { approvalId: 'a1', kind: 'email' } } },
      {
        event: 'done',
        data: {
          chatId: 'c1',
          content: {
            text: 'Found it',
            intent: 'find',
            status: 'completed',
            steps: [],
            cards: [],
            results: [],
          },
        },
      },
    ]);
    expect(sent).toEqual([{ chatId: 'c1', message: 'find the flight', emailId: 'e1' }]);
  });

  it('starts a new chat when none is given and reports failures inside the stream', async () => {
    const fresh = await api.post('/api/chat', { message: 'hi' });
    expect(events(fresh.text)[0]).toEqual({ event: 'chat', data: { type: 'chat', chatId: 'c2' } });
    expect(events(fresh.text).at(-1).event).toBe('done');

    const unknown = await api.post('/api/chat', { chatId: 'nope', message: 'hi' });
    expect(unknown.status).toBe(200);
    expect(events(unknown.text).at(-1)).toEqual({
      event: 'error',
      data: { message: 'Unknown chat' },
    });
  });

  it('validates input and routes card decisions through the chat', async () => {
    expect((await api.post('/api/chat', { message: '   ' })).status).toBe(400);
    expect((await api.post('/api/chat', { message: 'x'.repeat(4001) })).status).toBe(400);
    expect((await api.post('/api/chat', { message: 'hi', emailId: 'bad id' })).status).toBe(400);
    const decided = await api.post('/api/chats/c1/decide', { approvalId: 'a1', action: 'approve' });
    expect(decided.json).toEqual({ status: 'performed', text: 'c1:a1' });
    expect(
      (await api.post('/api/chats/c1/decide', { approvalId: 'a1', action: 'maybe' })).status,
    ).toBe(400);
  });
});

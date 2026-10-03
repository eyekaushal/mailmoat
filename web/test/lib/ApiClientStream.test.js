import { describe, expect, it } from 'vitest';
import { ApiClient } from '../../src/lib/ApiClient.js';

function sse(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('ApiClient.stream', () => {
  it('posts with the CSRF token and dispatches every SSE block, even when split across chunks', async () => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url, init });
      if (url === '/api/csrf')
        return new Response(JSON.stringify({ token: 'tok' }), {
          headers: { 'content-type': 'application/json' },
        });
      return new Response(
        sse([
          'event: chat\ndata: {"type":"chat","chatId":"c1"}\n\n',
          'event: chat\ndata: {"type":"step","step":1,"to',
          'ol":"search_emails","label":"Searching…","status":"running"}\n\nevent: done\ndata: {"chatId":"c1"}\n\n',
        ]),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    };
    const client = new ApiClient({ fetch });
    const events = [];
    await client.stream('/chat', { message: 'hi' }, (name, data) => events.push([name, data]));
    expect(events).toEqual([
      ['chat', { type: 'chat', chatId: 'c1' }],
      [
        'chat',
        { type: 'step', step: 1, tool: 'search_emails', label: 'Searching…', status: 'running' },
      ],
      ['done', { chatId: 'c1' }],
    ]);
    const post = calls.find((c) => c.url === '/api/chat');
    expect(post.init.headers['X-CSRF-Token']).toBe('tok');
    expect(post.init.body).toBe('{"message":"hi"}');
  });

  it('throws ApiError when the server refuses before streaming', async () => {
    const fetch = async (url) =>
      url === '/api/csrf'
        ? new Response(JSON.stringify({ token: 't' }), {
            headers: { 'content-type': 'application/json' },
          })
        : new Response(JSON.stringify({ error: 'Not connected' }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          });
    const client = new ApiClient({ fetch });
    await expect(client.stream('/chat', {}, () => {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'Not connected',
    });
  });
});

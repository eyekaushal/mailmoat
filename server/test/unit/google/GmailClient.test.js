import { describe, expect, it, vi } from 'vitest';
import { HistoryExpiredError, NotFoundError } from '../../../src/core/errors.js';
import { GmailClient } from '../../../src/google/GmailClient.js';

function makeClient(users) {
  const googleAuth = { getAuthClient: vi.fn(() => 'auth-client') };
  const createApi = vi.fn(() => ({ users }));
  return { client: new GmailClient(googleAuth, { createApi }), googleAuth, createApi };
}

describe('GmailClient', () => {
  it('reads the profile and authorizes lazily, once', async () => {
    const users = {
      getProfile: async () => ({
        data: { emailAddress: 'me@gmail.com', historyId: '42', messagesTotal: 7 },
      }),
    };
    const { client, googleAuth, createApi } = makeClient(users);
    expect(googleAuth.getAuthClient).not.toHaveBeenCalled();
    await client.getProfile();
    await expect(client.getProfile()).resolves.toEqual({
      email: 'me@gmail.com',
      historyId: '42',
      messagesTotal: 7,
    });
    expect(createApi).toHaveBeenCalledOnce();
    expect(createApi).toHaveBeenCalledWith('auth-client');
  });

  it('lists unique added message IDs from history', async () => {
    const users = {
      history: {
        list: async (params) => {
          expect(params).toMatchObject({ startHistoryId: '10', historyTypes: ['messageAdded'] });
          return {
            data: {
              historyId: '15',
              history: [
                { messagesAdded: [{ message: { id: 'a' } }, { message: { id: 'b' } }] },
                { messagesAdded: [{ message: { id: 'a' } }] },
                {},
              ],
            },
          };
        },
      },
    };
    await expect(makeClient(users).client.listHistory('10')).resolves.toEqual({
      messageIds: ['a', 'b'],
      historyId: '15',
      nextPageToken: undefined,
    });
  });

  it('signals expired history so sync can restart', async () => {
    const users = {
      history: {
        list: async () => {
          throw Object.assign(new Error('Not Found'), { code: 404 });
        },
      },
    };
    await expect(makeClient(users).client.listHistory('1')).rejects.toThrow(HistoryExpiredError);
  });

  it('decodes raw messages to bytes', async () => {
    const raw = 'From: a@b.com\r\nSubject: Hi\r\n\r\nHello';
    const users = {
      messages: {
        get: async ({ format }) => ({
          data: {
            id: 'm1',
            threadId: 't1',
            labelIds: ['INBOX'],
            internalDate: '1759300000000',
            raw: Buffer.from(raw).toString('base64url'),
            format,
          },
        }),
      },
    };
    const message = await makeClient(users).client.getRawMessage('m1');
    expect(message.raw.toString()).toBe(raw);
    expect(message.internalDate).toEqual(new Date(1759300000000));
    expect(message.labelIds).toEqual(['INBOX']);
  });

  it('reuses existing labels and creates missing ones once', async () => {
    const created = [];
    const users = {
      labels: {
        list: vi.fn(async () => ({ data: { labels: [{ name: 'mailmoat/FYI', id: 'L1' }] } })),
        create: async ({ requestBody }) => {
          created.push(requestBody.name);
          return { data: { id: 'L2' } };
        },
      },
    };
    const { client } = makeClient(users);
    expect(await client.ensureLabel('mailmoat/FYI')).toBe('L1');
    expect(await client.ensureLabel('mailmoat/⛔ Dangerous')).toBe('L2');
    expect(await client.ensureLabel('mailmoat/⛔ Dangerous')).toBe('L2');
    expect(created).toEqual(['mailmoat/⛔ Dangerous']);
    expect(users.labels.list).toHaveBeenCalledOnce();
  });

  it('archives by removing only the INBOX label', async () => {
    const modify = vi.fn(async () => ({}));
    await makeClient({ messages: { modify } }).client.archive('m1');
    expect(modify).toHaveBeenCalledWith({
      userId: 'me',
      id: 'm1',
      requestBody: { addLabelIds: [], removeLabelIds: ['INBOX'] },
    });
  });

  it('encodes drafts and sends as base64url', async () => {
    const draftsCreate = vi.fn(async () => ({ data: { id: 'd1' } }));
    const send = vi.fn(async () => ({ data: { id: 's1' } }));
    const { client } = makeClient({ drafts: { create: draftsCreate }, messages: { send } });
    const raw = Buffer.from('To: x@y.com\r\n\r\nHi');
    expect(await client.createDraft({ raw, threadId: 't1' })).toBe('d1');
    expect(await client.sendMessage({ raw })).toBe('s1');
    expect(draftsCreate.mock.calls[0][0].requestBody.message).toEqual({
      raw: raw.toString('base64url'),
      threadId: 't1',
    });
  });

  it("returns Gmail's snippet with the metadata", async () => {
    const users = {
      messages: {
        get: async () => ({
          data: {
            id: 'm1',
            threadId: 't1',
            labelIds: ['INBOX'],
            internalDate: '1759300000000',
            snippet: 'Hi there &amp; welcome',
            payload: { headers: [{ name: 'Subject', value: 'Hi' }] },
          },
        }),
      },
    };
    await expect(makeClient(users).client.getMessageMetadata('m1')).resolves.toMatchObject({
      headers: { subject: 'Hi' },
      snippet: 'Hi there &amp; welcome',
    });
  });

  it('lists a thread’s messages oldest first with Gmail facts only, and 404s as NotFoundError', async () => {
    const users = {
      threads: {
        get: async ({ id, format }) => {
          if (id === 'gone') throw Object.assign(new Error('Not Found'), { code: 404 });
          expect(format).toBe('minimal');
          return {
            data: {
              id,
              messages: [
                { id: 'b', threadId: id, labelIds: ['SENT'], internalDate: '1759300002000' },
                {
                  id: 'a',
                  threadId: id,
                  labelIds: ['INBOX', 'UNREAD'],
                  internalDate: '1759300001000',
                },
              ],
            },
          };
        },
      },
    };
    const { client } = makeClient(users);
    const thread = await client.getThread('t1');
    expect(thread.threadId).toBe('t1');
    expect(thread.messages.map((m) => m.id)).toEqual(['a', 'b']);
    expect(thread.messages[0]).toEqual({
      id: 'a',
      threadId: 't1',
      labelIds: ['INBOX', 'UNREAD'],
      internalDate: new Date(1759300001000),
    });
    expect(JSON.stringify(thread)).not.toContain('snippet');
    await expect(client.getThread('gone')).rejects.toThrow(NotFoundError);
  });
});

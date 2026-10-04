import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SenderRoutes } from '../../../../src/api/routes/SenderRoutes.js';
import { UnsubscribeError } from '../../../../src/core/errors.js';
import { startApi } from '../../../helpers/apiServer.js';

let api;
let calls;

beforeEach(async () => {
  calls = [];
  const unsubscribes = {
    listSenders: (filter) => [{ address: 'news@x.com', name: 'Daily News', filter }],
    blockWarning: (address) =>
      address === 'boss@acme.com' ? 'Warning: you reply to this sender' : null,
    requestUnsubscribe: async (address, options) => {
      calls.push(['unsubscribe', address, options]);
      if (address === 'risky@evil.com')
        throw new UnsubscribeError("The sender's latest email is DANGEROUS");
      return { status: 'UNSUBSCRIBED', method: 'one_click' };
    },
    block: async (address, options) => {
      calls.push(['block', address, options]);
      return { status: 'BLOCKED', warning: null };
    },
    keep: (address) => ({ status: 'KEPT', address }),
    undo: (address) => ({ status: 'NONE', resubscribed: false, note: address }),
    archiveAll: async (address, options) => {
      calls.push(['archiveAll', address, options]);
      return { archived: 4 };
    },
  };
  api = await startApi({ routes: [new SenderRoutes({ unsubscribes })] });
});

afterEach(() => api.close());

describe('SenderRoutes', () => {
  it('lists senders with validated filters and shows the block warning', async () => {
    expect((await api.get('/api/senders?sort=read&limit=10')).json).toEqual([
      {
        address: 'news@x.com',
        name: 'Daily News',
        filter: { sort: 'read', limit: 10 },
        avatar: { initials: 'DN', hue: expect.any(Number) },
      },
    ]);
    expect((await api.get('/api/senders?sort=random')).status).toBe(400);
    expect((await api.get('/api/senders/block-warning?address=Boss@Acme.com')).json).toEqual({
      warning: 'Warning: you reply to this sender',
    });
    expect((await api.get('/api/senders/block-warning?address=news@x.com')).json).toEqual({
      warning: null,
    });
    expect((await api.get('/api/senders/block-warning?address=nope')).status).toBe(400);
  });

  it('runs each button through the service as a dashboard action', async () => {
    expect((await api.post('/api/senders/unsubscribe', { address: 'News@X.com' })).json).toEqual({
      status: 'UNSUBSCRIBED',
      method: 'one_click',
    });
    const refused = await api.post('/api/senders/unsubscribe', { address: 'risky@evil.com' });
    expect(refused.status).toBe(400);
    expect(refused.json.error).toMatch(/DANGEROUS/);
    expect((await api.post('/api/senders/block', { address: 'news@x.com' })).json).toEqual({
      status: 'BLOCKED',
      warning: null,
    });
    expect((await api.post('/api/senders/keep', { address: 'news@x.com' })).json).toEqual({
      status: 'KEPT',
      address: 'news@x.com',
    });
    expect((await api.post('/api/senders/undo', { address: 'news@x.com' })).json).toMatchObject({
      status: 'NONE',
    });
    expect((await api.post('/api/senders/archive-all', { address: 'news@x.com' })).json).toEqual({
      archived: 4,
    });
    expect((await api.post('/api/senders/block', {})).status).toBe(400);
    expect(calls).toEqual([
      ['unsubscribe', 'news@x.com', { via: 'dashboard' }],
      ['unsubscribe', 'risky@evil.com', { via: 'dashboard' }],
      ['block', 'news@x.com', { via: 'dashboard' }],
      ['archiveAll', 'news@x.com', { via: 'dashboard' }],
    ]);
  });
});

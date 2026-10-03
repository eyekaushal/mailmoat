import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SystemRoutes } from '../../../../src/api/routes/SystemRoutes.js';
import { startApi } from '../../../helpers/apiServer.js';

let api;
let deleted;

beforeEach(async () => {
  deleted = 0;
  api = await startApi({
    routes: [
      new SystemRoutes({
        version: '0.1.0',
        googleAuth: { isConnected: () => true, connectedEmail: () => 'me@gmail.com' },
        anthropic: { isConfigured: () => false },
        syncState: { getLastPollAt: () => new Date('2026-10-08T10:00:00Z') },
        emails: { count: () => 12 },
        deleteAllData: async () => {
          deleted += 1;
        },
      }),
    ],
  });
});

afterEach(() => api.close());

describe('SystemRoutes', () => {
  it('reports health without any secret', async () => {
    const res = await api.get('/api/health');
    expect(res.json).toEqual({
      ok: true,
      version: '0.1.0',
      google: { connected: true, email: 'me@gmail.com' },
      anthropic: { configured: false },
      sync: { lastPollAt: '2026-10-08T10:00:00.000Z', emails: 12 },
    });
  });

  it('hands out the session CSRF token on GET only', async () => {
    const res = await api.get('/api/csrf');
    expect(res.json.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('deletes all local data only with an explicit confirmation', async () => {
    expect((await api.post('/api/data/delete-all', {})).status).toBe(400);
    expect((await api.post('/api/data/delete-all', { confirm: 'yes' })).status).toBe(400);
    expect(deleted).toBe(0);
    const res = await api.post('/api/data/delete-all', { confirm: 'DELETE' });
    expect(res.json).toEqual({ deleted: true, restart: true });
    expect(deleted).toBe(1);
  });
});

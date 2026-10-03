import { afterEach, describe, expect, it } from 'vitest';
import { SummaryRoutes } from '../../../../src/api/routes/SummaryRoutes.js';
import { startApi } from '../../../helpers/apiServer.js';

let api;
afterEach(() => api.close());

describe('SummaryRoutes', () => {
  it('returns the Today card', async () => {
    api = await startApi({
      routes: [
        new SummaryRoutes({ summary: { today: () => ({ date: '2026-10-08', toReply: 2 }) } }),
      ],
    });
    expect((await api.get('/api/summary/today')).json).toEqual({ date: '2026-10-08', toReply: 2 });
  });
});

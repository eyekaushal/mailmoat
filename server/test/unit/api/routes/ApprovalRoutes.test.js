import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApprovalRoutes } from '../../../../src/api/routes/ApprovalRoutes.js';
import { ApprovalError } from '../../../../src/core/errors.js';
import { startApi } from '../../../helpers/apiServer.js';

let api;
let calls;

beforeEach(async () => {
  calls = [];
  const pending = {
    id: 'a1',
    tool: 'send_email',
    status: 'PENDING',
    reason: 'Sends email',
    emailIds: ['e1'],
    args: { to: { value: 'x@y.z', sources: [{ type: 'user' }], readers: 'public' } },
    requestedAt: 't',
  };
  const approvals = {
    listPending: () => [pending],
    get: (id) => (id === 'a1' ? pending : undefined),
    edit: (id, changes) => {
      calls.push(['edit', id, changes]);
      if ('bogus' in changes) throw new ApprovalError('Unknown argument: bogus');
    },
    approve: async (id, options) => {
      calls.push(['approve', id, options]);
      return id === 'a1' && options.via === 'dashboard'
        ? { status: 'performed', result: { value: 'sent-1', sources: [] } }
        : { status: 'denied', reason: 'no' };
    },
    reject: (id, options) => calls.push(['reject', id, options]),
  };
  api = await startApi({ routes: [new ApprovalRoutes({ approvals, timeZone: 'Asia/Kolkata' })] });
});

afterEach(() => api.close());

describe('ApprovalRoutes', () => {
  it('lists and reads pending approvals', async () => {
    expect((await api.get('/api/approvals')).json).toHaveLength(1);
    expect((await api.get('/api/approvals/a1')).json).toMatchObject({
      id: 'a1',
      tool: 'send_email',
    });
    expect((await api.get('/api/approvals/zz')).status).toBe(404);
  });

  it('edits, approves (via dashboard, in the user zone) and rejects', async () => {
    const edited = await api.patch('/api/approvals/a1', { to: 'boss@acme.com' });
    expect(edited.status).toBe(200);
    expect((await api.patch('/api/approvals/a1', {})).status).toBe(400);
    expect((await api.patch('/api/approvals/a1', { bogus: 1 })).status).toBe(409);

    const approved = await api.post('/api/approvals/a1/approve');
    expect(approved.json).toEqual({ id: 'a1', status: 'performed', result: 'sent-1' });
    const rejected = await api.post('/api/approvals/a1/reject');
    expect(rejected.json).toEqual({ id: 'a1', status: 'rejected' });
    expect(calls).toEqual([
      ['edit', 'a1', { to: 'boss@acme.com' }],
      ['edit', 'a1', { bogus: 1 }],
      ['approve', 'a1', { via: 'dashboard', timeZone: 'Asia/Kolkata' }],
      ['reject', 'a1', { via: 'dashboard' }],
    ]);
    expect((await api.post('/api/approvals/zz/approve')).status).toBe(404);
  });
});

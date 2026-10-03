import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApprovalError, ToolError } from '../../../src/core/errors.js';
import { ActionExecutor } from '../../../src/actions/ActionExecutor.js';
import { ApprovalService } from '../../../src/actions/ApprovalService.js';
import { TaggedValue } from '../../../src/agent/TaggedValue.js';
import { Tool } from '../../../src/agent/tools/Tool.js';
import { ToolRegistry } from '../../../src/agent/tools/ToolRegistry.js';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { ApprovalRepository } from '../../../src/db/repositories/ApprovalRepository.js';
import { Decision } from '../../../src/policy/Decision.js';

class SendProbe extends Tool {
  constructor() {
    super({
      name: 'send_email',
      description: 'p',
      args: z.strictObject({
        to: z.array(z.email()).min(1).describe('to'),
        body: z.string().min(1).describe('b'),
      }),
    });
    this.calls = [];
  }
  async execute(args, context) {
    this.calls.push({ args, context });
    return TaggedValue.fromOwnData({ messageId: 'sent-1' }, 'inbox');
  }
}

const email42 = (v) => TaggedValue.fromEmail(v, { id: '42', participants: ['rahul@acme.example'] });
let db;
let repo;
let probe;
let audit;
let policyCalls;
let policyOutcome;
let service;
let clock;

beforeEach(() => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
  repo = new ApprovalRepository(db);
  probe = new SendProbe();
  audit = [];
  policyCalls = [];
  policyOutcome = Decision.ask('needs approval', 'SendRule');
  clock = new Date('2026-10-05T10:00:00Z');
  const registry = new ToolRegistry([probe]);
  const auditLog = { record: (e) => audit.push(e) };
  service = new ApprovalService({
    approvals: repo,
    registry,
    policy: { decide: (call) => (policyCalls.push(call), policyOutcome) },
    executor: new ActionExecutor({ registry, auditLog }),
    auditLog,
    now: () => clock,
  });
});

const call = (
  args = { to: TaggedValue.fromUser(['rahul@acme.example']), body: email42('his words') },
) => ({
  step: 1,
  tool: 'send_email',
  args,
  emailIds: ['42'],
});

describe('ApprovalService', () => {
  it('stores the exact call with provenance and lists it', async () => {
    const { id } = await service.request({ call: call(), reason: 'needs approval' });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(service.listPending()).toEqual([
      {
        id,
        tool: 'send_email',
        reason: 'needs approval',
        emailIds: ['42'],
        args: {
          to: { value: ['rahul@acme.example'], sources: [{ type: 'user' }], readers: 'public' },
          body: {
            value: 'his words',
            sources: [{ type: 'email', id: '42' }],
            readers: ['rahul@acme.example'],
          },
        },
        requestedAt: '2026-10-05T10:00:00.000Z',
      },
    ]);
    expect(repo.get(id).sources).toEqual([{ type: 'user' }, { type: 'email', id: '42' }]);
    expect(audit[0]).toMatchObject({
      event: 'approval_requested',
      subject: 'send_email',
      data: { approvalId: id },
    });
  });

  it('approve re-runs policy on the stored call, performs it and closes the approval', async () => {
    const { id } = await service.request({ call: call(), reason: 'r' });
    clock = new Date('2026-10-05T11:00:00Z');
    const result = await service.approve(id, { via: 'dashboard', timeZone: 'Asia/Kolkata' });
    expect(result.status).toBe('performed');
    expect(result.result.value).toEqual({ messageId: 'sent-1' });
    expect(result.result.emailIds()).toEqual(['42']);
    expect(policyCalls[0]).toMatchObject({ step: 1, tool: 'send_email', emailIds: ['42'] });
    expect(policyCalls[0].args.body).toBeInstanceOf(TaggedValue);
    expect([...policyCalls[0].args.body.readers]).toEqual(['rahul@acme.example']);
    expect(probe.calls[0].context).toEqual({ now: clock, timeZone: 'Asia/Kolkata' });
    expect(repo.get(id)).toMatchObject({
      status: 'APPROVED',
      decidedAt: '2026-10-05T11:00:00.000Z',
      decidedVia: 'dashboard',
    });
    expect(audit.map((e) => e.event)).toEqual([
      'approval_requested',
      'action_performed',
      'approval_decided',
    ]);
    expect(audit[1]).toMatchObject({ actor: 'user', data: { approvalId: id } });
    expect(audit[2]).toMatchObject({
      actor: 'user',
      decision: 'APPROVED',
      data: { approvalId: id, via: 'dashboard' },
    });
    expect(service.listPending()).toEqual([]);
  });

  it('refuses an approval the policy now denies, without running the tool', async () => {
    const { id } = await service.request({ call: call(), reason: 'r' });
    policyOutcome = Decision.deny('recipient from email', 'SendRule');
    const result = await service.approve(id, { via: 'dashboard', timeZone: 'UTC' });
    expect(result).toEqual({ status: 'denied', reason: 'recipient from email' });
    expect(probe.calls).toHaveLength(0);
    expect(repo.get(id).status).toBe('REJECTED');
    expect(audit.at(-1)).toMatchObject({
      event: 'approval_decided',
      decision: 'REJECTED',
      reason: 'recipient from email',
    });
  });

  it('reject closes the approval and nothing runs', async () => {
    const { id } = await service.request({ call: call(), reason: 'r' });
    service.reject(id, { via: 'dashboard' });
    expect(repo.get(id).status).toBe('REJECTED');
    expect(probe.calls).toHaveLength(0);
    await expect(service.approve(id, { via: 'dashboard', timeZone: 'UTC' })).rejects.toThrow(
      ApprovalError,
    );
    expect(() => service.reject(id, { via: 'dashboard' })).toThrow(/REJECTED/);
    expect(() => service.reject('nope', { via: 'dashboard' })).toThrow(/Unknown approval/);
  });

  it('edit replaces values with user-sourced ones after validating them', async () => {
    const { id } = await service.request({ call: call(), reason: 'r' });
    service.edit(id, { body: 'my own words' });
    const [pending] = service.listPending();
    expect(pending.args.body).toEqual({
      value: 'my own words',
      sources: [{ type: 'user' }],
      readers: 'public',
    });
    expect(pending.args.to.sources).toEqual([{ type: 'user' }]);
    expect(() => service.edit(id, { body: '' })).toThrow(ToolError);
    expect(() => service.edit(id, { bcc: ['eve@evil.example'] })).toThrow(ApprovalError);
    await service.approve(id, { via: 'dashboard', timeZone: 'UTC' });
    expect(probe.calls[0].args.body.value).toBe('my own words');
    expect(probe.calls[0].args.body.sources).toEqual([{ type: 'user' }]);
  });

  it('leaves the approval pending when the tool fails', async () => {
    const { id } = await service.request({ call: call(), reason: 'r' });
    probe.execute = async () => {
      throw new ToolError('gmail down');
    };
    await expect(service.approve(id, { via: 'dashboard', timeZone: 'UTC' })).rejects.toThrow(
      ToolError,
    );
    expect(repo.get(id).status).toBe('PENDING');
  });
});

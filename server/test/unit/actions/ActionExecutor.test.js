import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ToolError } from '../../../src/core/errors.js';
import { ActionExecutor } from '../../../src/actions/ActionExecutor.js';
import { TaggedValue } from '../../../src/agent/TaggedValue.js';
import { Tool } from '../../../src/agent/tools/Tool.js';
import { ToolRegistry } from '../../../src/agent/tools/ToolRegistry.js';

class Probe extends Tool {
  constructor(result) {
    super({
      name: 'archive',
      description: 'p',
      args: z.strictObject({ email_id: z.string().min(1).describe('id') }),
    });
    this.result = result;
    this.calls = [];
  }
  async execute(args, context) {
    this.calls.push({ args, context });
    return this.result(args);
  }
}

const context = { now: new Date('2026-10-05T10:00:00Z'), timeZone: 'Asia/Kolkata' };
function setup(result = () => TaggedValue.fromOwnData({ archived: true }, 'inbox')) {
  const probe = new Probe(result);
  const audit = [];
  const registry = new ToolRegistry([probe]);
  return {
    probe,
    audit,
    executor: new ActionExecutor({ registry, auditLog: { record: (e) => audit.push(e) } }),
  };
}
const call = (args, emailIds = ['42']) => ({ step: 2, tool: 'archive', args, emailIds });

describe('ActionExecutor', () => {
  it("runs the tool and returns a result carrying the arguments' provenance", async () => {
    const { executor, probe, audit } = setup();
    const id = TaggedValue.fromEmail('42', { id: '42', participants: ['rahul@acme.example'] });
    const result = await executor.perform(call({ email_id: id }), context);
    expect(result.value).toEqual({ archived: true });
    expect(result.sources).toEqual([{ type: 'inbox' }, { type: 'email', id: '42' }]);
    expect(result.readers).toBe('user-only');
    expect(probe.calls[0].context).toBe(context);
    expect(audit).toEqual([
      {
        actor: 'system',
        event: 'action_performed',
        subject: 'archive',
        data: { step: 2, approvalId: null, emailIds: ['42'], sources: result.sources },
      },
    ]);
  });

  it("marks approved actions as the user's", async () => {
    const { executor, audit } = setup();
    await executor.perform(call({ email_id: TaggedValue.fromUser('42') }), context, {
      approvalId: 'ap-1',
    });
    expect(audit[0]).toMatchObject({ actor: 'user', data: { approvalId: 'ap-1' } });
  });

  it('re-validates arguments and rejects untagged results or unknown tools', async () => {
    const { executor, probe } = setup(() => ({ plain: true }));
    await expect(
      executor.perform(call({ email_id: TaggedValue.fromUser('') }), context),
    ).rejects.toThrow(/Invalid arguments/);
    expect(probe.calls).toHaveLength(0);
    await expect(
      executor.perform(call({ email_id: TaggedValue.fromUser('42') }), context),
    ).rejects.toThrow(/untagged/);
    await expect(executor.perform({ ...call({}), tool: 'send_email' }, context)).rejects.toThrow(
      ToolError,
    );
  });
});

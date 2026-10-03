import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Logger } from '../../../src/core/Logger.js';
import { HandleError, ToolError } from '../../../src/core/errors.js';
import { HandleStore } from '../../../src/agent/HandleStore.js';
import { PlanInterpreter } from '../../../src/agent/PlanInterpreter.js';
import { TaggedValue } from '../../../src/agent/TaggedValue.js';
import { Tool } from '../../../src/agent/tools/Tool.js';
import { ToolRegistry } from '../../../src/agent/tools/ToolRegistry.js';
import { ActionExecutor } from '../../../src/actions/ActionExecutor.js';

/** A tool that records its tagged args and returns a configurable value. */
class ProbeTool extends Tool {
  constructor(name, args, result = () => TaggedValue.fromOwnData({ ok: true }, 'inbox')) {
    super({ name, description: `${name} probe`, args });
    this.calls = [];
    this.result = result;
  }

  async execute(args, context) {
    this.calls.push({ args, context });
    return typeof this.result === 'function' ? this.result(args) : this.result;
  }
}

const anyString = z.string().describe('s');
const tools = () => ({
  search: new ProbeTool('search_emails', z.strictObject({ from: anyString.optional() }), () =>
    TaggedValue.fromOwnData({ emails: [{ id: '42', summary: 'secret summary' }] }, 'inbox'),
  ),
  extract: new ProbeTool(
    'extract',
    z.strictObject({ handle: anyString, kind: z.enum(['datetimes']).describe('k') }),
    (args) => args.handle.derive(['2026-10-09T17:00']),
  ),
  send: new ProbeTool(
    'send_email',
    z.strictObject({ to: z.array(z.email()).describe('to'), body: anyString }),
  ),
  memory: new ProbeTool('save_memory', z.strictObject({ content: anyString })),
  event: new ProbeTool(
    'create_calendar_event',
    z.strictObject({
      title: anyString,
      start: anyString,
      attendees: z.array(z.string()).optional().describe('a'),
    }),
  ),
  archive: new ProbeTool('archive', z.strictObject({ email_id: anyString })),
});

const allow = { decide: () => ({ outcome: 'ALLOW', reason: 'test' }) };
const logger = new Logger({ level: 'error', sink: () => {} });

function setup({ policy = allow, probes = tools() } = {}) {
  const audit = [];
  const approvals = [];
  const registry = new ToolRegistry(Object.values(probes));
  const auditLog = { record: (entry) => audit.push(entry) };
  const interpreter = new PlanInterpreter({
    registry,
    policy,
    executor: new ActionExecutor({ registry, auditLog }),
    approvals: {
      request: async (input) => (approvals.push(input), { id: `ap-${approvals.length}` }),
    },
    auditLog,
    logger,
  });
  const handles = new HandleStore();
  handles.register(
    '$email_42.body',
    TaggedValue.fromEmail('Flight Fri 17:00', {
      id: '42',
      participants: ['indigo@airline.example', 'me@example.com'],
    }),
  );
  handles.register('$email_42.summary', async () =>
    TaggedValue.fromEmail('Booking', { id: '42', participants: ['indigo@airline.example'] }),
  );
  const session = {
    request: 'Find time with Mia after my flight and email mia@example.com',
    handles,
    now: new Date('2026-10-05T10:00:00Z'),
    timeZone: 'Asia/Kolkata',
  };
  return {
    interpreter,
    probes,
    audit,
    approvals,
    session,
    run: (steps, message = 'plan') => interpreter.run({ message, steps }, session),
  };
}

describe('PlanInterpreter provenance', () => {
  it('tags literals as user only when they appear in the request', async () => {
    const { run, probes } = setup();
    await run([
      { tool: 'send_email', args: { to: ['Mia@example.com'], body: 'Hello from the planner' } },
    ]);
    const { args } = probes.send.calls[0];
    expect(args.to.sources).toEqual([{ type: 'user' }]);
    expect(args.to.value).toEqual(['Mia@example.com']);
    expect(args.body.sources).toEqual([{ type: 'planner' }]);
    expect(args.body.readers).toBe('public');
  });

  it('mixes sources inside a list and treats empty lists and non-strings as planner data', async () => {
    const { run, probes } = setup();
    await run([
      {
        tool: 'create_calendar_event',
        args: {
          title: 'after my flight',
          start: '2026-10-09T17:00:00Z',
          attendees: ['mia@example.com', 'eve@evil.example'],
        },
      },
    ]);
    const { args } = probes.event.calls[0];
    expect(args.title.sources).toEqual([{ type: 'user' }]);
    expect(args.start.sources).toEqual([{ type: 'planner' }]);
    expect(args.attendees.sources).toEqual([{ type: 'user' }, { type: 'planner' }]);
    await run([{ tool: 'create_calendar_event', args: { title: 'x', start: 'y', attendees: [] } }]);
    expect(probes.event.calls[1].args.attendees.sources).toEqual([{ type: 'planner' }]);
  });

  it('resolves handles to tainted text and keeps the taint through extract', async () => {
    const { run, probes } = setup();
    const result = await run([
      { tool: 'extract', args: { handle: { handle: '$email_42.body' }, kind: 'datetimes' } },
    ]);
    expect(probes.extract.calls[0].args.handle.value).toBe('Flight Fri 17:00');
    expect(result.status).toBe('completed');
    const out = result.steps[0].result;
    expect(out.value).toEqual(['2026-10-09T17:00']);
    expect(out.sources).toEqual([{ type: 'email', id: '42' }, { type: 'planner' }]);
    expect([...out.readers]).toEqual(['indigo@airline.example', 'me@example.com']);
  });

  it('carries step results, with fields, into later steps and unions provenance', async () => {
    const { run, probes } = setup();
    const result = await run([
      { tool: 'search_emails', args: {} },
      { tool: 'extract', args: { handle: { handle: '$email_42.summary' }, kind: 'datetimes' } },
      { tool: 'send_email', args: { to: ['mia@example.com'], body: { step: 1, field: '0' } } },
      { tool: 'archive', args: { email_id: { step: 0, field: 'emails.0.id' } } },
    ]);
    expect(result.status).toBe('completed');
    const body = probes.send.calls[0].args.body;
    expect(body.value).toBe('2026-10-09T17:00');
    expect(body.emailIds()).toEqual(['42']);
    expect([...body.readers]).toEqual(['indigo@airline.example']);
    expect(probes.archive.calls[0].args.email_id.value).toBe('42');
    // The send result inherits the email taint of its body and the user source of its recipients.
    expect(result.steps[2].result.sources).toEqual([
      { type: 'inbox' },
      { type: 'user' },
      { type: 'email', id: '42' },
      { type: 'planner' },
    ]);
    expect(result.steps[2].result.readers).toBe('user-only');
  });

  it('passes the session context and reports emails involved to the policy', async () => {
    const calls = [];
    const policy = { decide: (call) => (calls.push(call), { outcome: 'ALLOW', reason: 'ok' }) };
    const { run, probes } = setup({ policy });
    await run([
      { tool: 'archive', args: { email_id: '42' } },
      { tool: 'extract', args: { handle: { handle: '$email_42.body' }, kind: 'datetimes' } },
    ]);
    expect(calls[0]).toMatchObject({ step: 0, tool: 'archive', emailIds: ['42'] });
    expect(calls[1]).toMatchObject({ step: 1, tool: 'extract', emailIds: ['42'] });
    expect(calls[0].args.email_id).toBeInstanceOf(TaggedValue);
    expect(probes.archive.calls[0].context).toEqual({
      now: new Date('2026-10-05T10:00:00Z'),
      timeZone: 'Asia/Kolkata',
    });
  });
});

describe('PlanInterpreter decisions and failures', () => {
  it('stops at a DENY and runs nothing after it', async () => {
    const policy = {
      decide: (call) =>
        call.tool === 'send_email'
          ? { outcome: 'DENY', reason: 'recipient from email' }
          : { outcome: 'ALLOW', reason: 'ok' },
    };
    const { run, probes, audit } = setup({ policy });
    const result = await run([
      { tool: 'search_emails', args: {} },
      { tool: 'send_email', args: { to: ['mia@example.com'], body: 'x' } },
      { tool: 'archive', args: { email_id: '42' } },
    ]);
    expect(result).toMatchObject({ status: 'stopped', message: 'plan' });
    expect(result.steps.map((s) => [s.tool, s.decision])).toEqual([
      ['search_emails', 'ALLOW'],
      ['send_email', 'DENY'],
    ]);
    expect(result.steps[1].reason).toBe('recipient from email');
    expect(probes.send.calls).toHaveLength(0);
    expect(probes.archive.calls).toHaveLength(0);
    expect(
      audit
        .filter((e) => e.event === 'policy_decision')
        .map((e) => [e.event, e.subject, e.decision]),
    ).toEqual([
      ['policy_decision', 'search_emails', 'ALLOW'],
      ['policy_decision', 'send_email', 'DENY'],
    ]);
  });

  it('queues an ASK as an approval and ends the plan as pending', async () => {
    const policy = {
      decide: (call) => ({
        outcome: call.tool === 'send_email' ? 'ASK' : 'ALLOW',
        reason: 'needs approval',
      }),
    };
    const { run, probes, approvals } = setup({ policy });
    const result = await run([
      { tool: 'send_email', args: { to: ['mia@example.com'], body: 'hi' } },
      { tool: 'archive', args: { email_id: '42' } },
    ]);
    expect(result.status).toBe('pending');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ decision: 'ASK', approvalId: 'ap-1', result: null });
    expect(approvals[0].call).toMatchObject({ step: 0, tool: 'send_email' });
    expect(approvals[0].call.args.to.value).toEqual(['mia@example.com']);
    expect(probes.send.calls).toHaveLength(0);
    expect(probes.archive.calls).toHaveLength(0);
  });

  it.each([
    ['an unknown tool', [{ tool: 'unsubscribe', args: {} }], /Unknown tool/],
    [
      'an invalid argument',
      [{ tool: 'send_email', args: { to: ['not-an-address'], body: 'x' } }],
      /Invalid arguments for send_email: to/,
    ],
    [
      'an unknown handle',
      [{ tool: 'extract', args: { handle: { handle: '$email_9.body' }, kind: 'datetimes' } }],
      /Unknown handle/,
    ],
    [
      'a reference to a missing step result',
      [{ tool: 'archive', args: { email_id: { step: 3, field: null } } }],
      /no result/,
    ],
    [
      'a reference to a missing field',
      [
        { tool: 'search_emails', args: {} },
        { tool: 'archive', args: { email_id: { step: 0, field: 'emails.5.id' } } },
      ],
      /no field/,
    ],
    [
      'an unknown policy outcome',
      [{ tool: 'archive', args: { email_id: '42' } }],
      /unknown outcome/,
      { decide: () => ({ outcome: 'MAYBE', reason: '' }) },
    ],
  ])('fails closed on %s', async (_label, steps, reason, policy = allow) => {
    const { run, audit } = setup({ policy });
    const result = await run(steps);
    expect(result.status).toBe('stopped');
    const last = result.steps.at(-1);
    expect(last.decision).toBe('DENY');
    expect(last.reason).toMatch(reason);
    expect(audit.at(-1)).toMatchObject({ event: 'policy_decision', decision: 'DENY' });
  });

  it('denies and stops when a tool throws or returns an untagged value', async () => {
    const probes = tools();
    probes.archive.result = () => {
      throw new ToolError('gmail down');
    };
    probes.search.result = () => ({ plain: true });
    const { run } = setup({ probes });
    const broken = await run([
      { tool: 'archive', args: { email_id: '42' } },
      { tool: 'archive', args: { email_id: '42' } },
    ]);
    expect(broken.status).toBe('stopped');
    expect(broken.steps).toHaveLength(1);
    expect(broken.steps[0].reason).toBe('ToolError: gmail down');
    const untagged = await run([{ tool: 'search_emails', args: {} }]);
    expect(untagged.steps[0].reason).toMatch(/untagged/);
  });

  it('denies when a handle loader fails', async () => {
    const { interpreter, session } = setup();
    session.handles.register('$email_7.body', async () => {
      throw new Error('gmail down');
    });
    const result = await interpreter.run(
      {
        message: '',
        steps: [
          { tool: 'extract', args: { handle: { handle: '$email_7.body' }, kind: 'datetimes' } },
        ],
      },
      session,
    );
    expect(result.steps[0].reason).toMatch(HandleError.name);
  });

  it('audits provenance but never argument values', async () => {
    const { run, audit } = setup();
    await run([
      { tool: 'extract', args: { handle: { handle: '$email_42.body' }, kind: 'datetimes' } },
    ]);
    const decision = audit.find((e) => e.event === 'policy_decision');
    expect(audit.map((e) => e.event)).toEqual(['action_performed', 'policy_decision']);
    expect(decision.data.args).toEqual({
      handle: {
        sources: [{ type: 'email', id: '42' }],
        readers: ['indigo@airline.example', 'me@example.com'],
      },
      kind: { sources: [{ type: 'planner' }], readers: 'public' },
    });
    expect(JSON.stringify(audit)).not.toContain('Flight Fri');
  });

  it('completes an empty plan', async () => {
    const { run } = setup();
    expect(await run([], 'Not supported yet.')).toEqual({
      status: 'completed',
      message: 'Not supported yet.',
      steps: [],
    });
  });
});

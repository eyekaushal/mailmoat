import { describe, expect, it } from 'vitest';
import { Logger } from '../../../src/core/Logger.js';
import { TaggedValue } from '../../../src/agent/TaggedValue.js';
import { PolicyEngine } from '../../../src/policy/PolicyEngine.js';
import { CalendarRule } from '../../../src/policy/rules/CalendarRule.js';
import { DraftRule } from '../../../src/policy/rules/DraftRule.js';
import { PolicyRule } from '../../../src/policy/rules/PolicyRule.js';
import { ReadRule } from '../../../src/policy/rules/ReadRule.js';
import { fakeRepos, FORM, RECORD } from '../../helpers/agentFixtures.js';

const logger = new Logger({ level: 'error', sink: () => {} });
const user = (v) => TaggedValue.fromUser(v);

function engine(
  rules,
  emails = [{ record: RECORD, form: FORM, verdict: { level: 'SUSPICIOUS' } }],
) {
  const repos = fakeRepos(emails);
  return new PolicyEngine({ rules, emails: repos.emails, verdicts: repos.verdicts, logger });
}

describe('PolicyEngine', () => {
  it('routes to the rule for the tool with risk and participants of the emails involved', () => {
    const seen = [];
    class Spy extends PolicyRule {
      constructor() {
        super(['archive']);
      }
      decide(call, context) {
        seen.push(context);
        return this.allow('spy');
      }
    }
    const d = engine([new ReadRule(), new Spy()]).decide({
      step: 0,
      tool: 'archive',
      args: {},
      emailIds: ['18f3a', 'missing'],
    });
    expect(d).toMatchObject({ outcome: 'ALLOW', reason: 'spy', rule: 'Spy' });
    expect(seen[0]).toEqual({
      levels: { '18f3a': 'SUSPICIOUS', missing: 'SUSPICIOUS' },
      participants: { '18f3a': ['rahul@acme.example', 'me@example.com'], missing: [] },
    });
  });

  it('denies a tool no rule covers', () => {
    const d = engine([new ReadRule()]).decide({
      step: 0,
      tool: 'send_email',
      args: {},
      emailIds: [],
    });
    expect(d).toEqual({
      outcome: 'DENY',
      reason: 'No policy rule covers send_email',
      rule: 'PolicyEngine',
    });
  });

  it('denies when a rule throws (P8)', () => {
    class Broken extends PolicyRule {
      constructor() {
        super(['archive']);
      }
      decide() {
        throw new TypeError('bug');
      }
    }
    const d = engine([new Broken()]).decide({ step: 0, tool: 'archive', args: {}, emailIds: [] });
    expect(d).toEqual({
      outcome: 'DENY',
      reason: 'Policy check failed (TypeError)',
      rule: 'PolicyEngine',
    });
  });

  it('uses the stored verdict: a draft from a SUSPICIOUS email asks, from a SAFE one is allowed', () => {
    const body = TaggedValue.fromEmail('x', { id: '18f3a', participants: ['rahul@acme.example'] });
    const call = {
      step: 0,
      tool: 'create_draft',
      args: { to: user(['rahul@acme.example']), subject: user('s'), body },
      emailIds: ['18f3a'],
    };
    expect(engine([new DraftRule()]).decide(call).outcome).toBe('ASK');
    expect(
      engine(
        [new DraftRule()],
        [{ record: RECORD, form: FORM, verdict: { level: 'SAFE' } }],
      ).decide(call).outcome,
    ).toBe('ALLOW');
  });

  it("lets the calendar rule see the source email's participants", () => {
    const attendees = TaggedValue.fromEmail(['rahul@acme.example'], {
      id: '18f3a',
      participants: ['rahul@acme.example'],
    });
    const call = {
      step: 0,
      tool: 'create_calendar_event',
      args: { title: user('t'), start: user('a'), end: user('b'), attendees },
      emailIds: ['18f3a'],
    };
    expect(engine([new CalendarRule()]).decide(call).outcome).toBe('ASK');
  });
});

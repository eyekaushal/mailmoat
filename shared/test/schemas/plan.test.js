import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MAX_PLAN_STEPS,
  PLAN_TOOLS,
  PlanSchema,
  isHandleReference,
  isStepReference,
} from '../../src/schemas/plan.js';

const plan = (steps, message = 'ok') => ({ message, steps });
const step = (tool, args = []) => ({ tool, args });
const arg = (name, value) => ({ name, value });

const VALID = plan([
  step('search_emails', [arg('query', 'from rahul'), arg('limit', 5)]),
  step('summarise', [arg('handle', { handle: '$email_18f3-a.summary' })]),
  step('send_email', [
    arg('to', ['bob@example.com']),
    arg('body', { step: 1, field: 'text' }),
    arg('urgent', false),
    arg('cc', null),
  ]),
]);

describe('PlanSchema', () => {
  it('accepts a plan with literals, lists, handles and step references', () => {
    expect(PlanSchema.parse(VALID)).toEqual(VALID);
    expect(PlanSchema.safeParse(plan([], 'Not supported yet.')).success).toBe(true);
  });

  it('lists exactly the 15 v1 tools and no forward', () => {
    expect(PLAN_TOOLS).toHaveLength(15);
    expect(PLAN_TOOLS).not.toContain('forward');
  });

  it.each([
    ['an unknown tool', plan([step('forward', [])])],
    ['an extra top-level key', { ...VALID, thinking: 'x' }],
    ['a step with an extra key', plan([{ ...step('archive'), when: 'now' }])],
    ['a bad argument name', plan([step('archive', [arg('Email-Id', 'x')])])],
    ['a duplicate argument', plan([step('archive', [arg('id', 'a'), arg('id', 'b')])])],
    [
      'a malformed handle',
      plan([step('summarise', [arg('handle', { handle: 'email_1.summary' })])]),
    ],
    [
      'a handle to a field that is not text',
      plan([step('summarise', [arg('h', { handle: '$email_1.from' })])]),
    ],
    ['a self reference', plan([step('archive', [arg('id', { step: 0, field: null })])])],
    [
      'a forward reference',
      plan([step('archive', [arg('id', { step: 1, field: null })]), step('archive')]),
    ],
    [
      'a negative step',
      plan([step('archive'), step('archive', [arg('id', { step: -1, field: null })])]),
    ],
    [
      'a reference missing its field key',
      plan([step('archive'), step('archive', [arg('id', { step: 0 })])]),
    ],
    ['a nested object value', plan([step('archive', [arg('id', { nested: { deep: true } })])])],
    ['a list of objects', plan([step('archive', [arg('ids', [{ step: 0 }])])])],
    ['a long message', plan([], 'x'.repeat(501))],
    ['too many steps', plan(Array(MAX_PLAN_STEPS + 1).fill(step('archive')))],
  ])('rejects %s', (_label, bad) => {
    expect(PlanSchema.safeParse(bad).success).toBe(false);
  });

  it('converts to a JSON schema with every object closed (structured outputs)', () => {
    const json = z.toJSONSchema(PlanSchema);
    const objects = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') {
        if (node.type === 'object') objects.push(node);
        Object.values(node).forEach(walk);
      }
    };
    walk(json);
    expect(objects.length).toBeGreaterThan(3);
    expect(objects.every((node) => node.additionalProperties === false)).toBe(true);
  });

  it('tells references and handles apart from literals', () => {
    expect(isStepReference({ step: 0, field: null })).toBe(true);
    expect(isHandleReference({ handle: '$email_1.body' })).toBe(true);
    expect(isStepReference('step')).toBe(false);
    expect(isHandleReference(['$email_1.body'])).toBe(false);
    expect(isStepReference(null)).toBe(false);
  });
});

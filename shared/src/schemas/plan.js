import { z } from 'zod';

/** The v1 tool set (PRD F12.6). No `forward`: it only widens the exfiltration surface. */
export const PLAN_TOOLS = Object.freeze([
  'search_emails',
  'get_email_fields',
  'extract',
  'summarise',
  'apply_label',
  'archive',
  'mark_read',
  'create_draft',
  'send_email',
  'reply',
  'get_free_busy',
  'create_calendar_event',
  'unsubscribe',
  'block_sender',
  'save_memory',
]);

/** The only free-text fields of an email, reachable through opaque handles (SECURITY_APPROACH §7.5). */
export const HANDLE_FIELDS = Object.freeze(['summary', 'body']);

export const MAX_PLAN_STEPS = 20;
export const MAX_STEP_ARGS = 12;
export const MAX_MESSAGE_CHARS = 500;
export const MAX_LITERAL_CHARS = 4_000;
export const MAX_LIST_ITEMS = 50;

export const HANDLE_PATTERN = /^\$email_[A-Za-z0-9_-]{1,64}\.(summary|body)$/;
export const ARG_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

const literalString = z.string().max(MAX_LITERAL_CHARS);

/** A literal the user typed, as the model relays it. */
const ScalarSchema = z.union([literalString, z.number(), z.boolean(), z.null()]);

/** The result of an earlier step (0-based), optionally one field of it (dotted path). */
export const StepReferenceSchema = z.strictObject({
  step: z.int().min(0),
  field: z.string().max(100).nullable(),
});

/** An opaque pointer to email text the Planner must never see. */
export const HandleReferenceSchema = z.strictObject({
  handle: z.string().regex(HANDLE_PATTERN),
});

export const PlanArgValueSchema = z.union([
  ScalarSchema,
  z.array(literalString).max(MAX_LIST_ITEMS),
  HandleReferenceSchema,
  StepReferenceSchema,
]);

// Args are name/value pairs rather than an object: structured outputs need every object closed
// with `additionalProperties: false`, which rules out free-form keys.
export const PlanArgSchema = z.strictObject({
  name: z.string().regex(ARG_NAME_PATTERN),
  value: PlanArgValueSchema,
});

export const PlanStepSchema = z.strictObject({
  tool: z.enum(PLAN_TOOLS),
  args: z.array(PlanArgSchema).max(MAX_STEP_ARGS),
});

/**
 * What the Planner may answer (SECURITY_APPROACH §7.5, PRD F12.2): a short plain-text message for
 * the user and an ordered list of tool steps. The Planner never executes anything itself; code
 * runs the steps, and the Policy Engine judges each one.
 */
export const PlanSchema = z
  .strictObject({
    message: z.string().max(MAX_MESSAGE_CHARS),
    steps: z.array(PlanStepSchema).max(MAX_PLAN_STEPS),
  })
  .superRefine((plan, ctx) => {
    plan.steps.forEach((step, index) => {
      const seen = new Set();
      step.args.forEach((arg, argIndex) => {
        if (seen.has(arg.name)) {
          ctx.addIssue({
            code: 'custom',
            path: ['steps', index, 'args', argIndex, 'name'],
            message: `duplicate argument "${arg.name}"`,
          });
        }
        seen.add(arg.name);
        if (isStepReference(arg.value) && arg.value.step >= index) {
          ctx.addIssue({
            code: 'custom',
            path: ['steps', index, 'args', argIndex, 'value', 'step'],
            message: 'a step may only reference earlier steps',
          });
        }
      });
    });
  });

/** @param {unknown} value */
export function isStepReference(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'step' in value;
}

/** @param {unknown} value */
export function isHandleReference(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'handle' in value;
}

/**
 * @typedef {z.infer<typeof PlanSchema>} PlanOutput raw model output (args as pairs)
 * @typedef {z.infer<typeof PlanArgValueSchema>} PlanArgValue
 */

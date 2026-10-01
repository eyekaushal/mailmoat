import { parse } from 'parse5';
import { Signal } from '../Signal.js';

/** S20: the email itself contains a form or password field; real services never ask for logins inside an email. */
export class AuthFormInHtmlSignal extends Signal {
  constructor() {
    super({ id: 'S20', name: 'AUTH_FORM_IN_HTML', severity: 'high' });
  }

  evaluate(email) {
    if (!email.html) return null;
    const found = this.#find(parse(email.html, { scriptingEnabled: false }));
    if (!found) return null;
    return this.fire(
      found === 'password'
        ? 'The email contains a password field.'
        : 'The email contains a form that can send what you type to someone else.',
    );
  }

  /** @returns {'password'|'form'|null} */
  #find(node) {
    if (
      node.tagName === 'input' &&
      node.attrs.some((a) => a.name === 'type' && a.value.toLowerCase() === 'password')
    ) {
      return 'password';
    }
    let found = node.tagName === 'form' ? 'form' : null;
    for (const child of node.content?.childNodes ?? node.childNodes ?? []) {
      const inner = this.#find(child);
      if (inner === 'password') return inner;
      found ??= inner;
    }
    return found;
  }
}

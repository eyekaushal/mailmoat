import { Signal } from '../Signal.js';

/** S17: `https://paypal.com@evil.example/` — everything before `@` is decoration; the host is after it. */
export class LinkUserinfoTrickSignal extends Signal {
  constructor() {
    super({ id: 'S17', name: 'LINK_USERINFO_TRICK', severity: 'high' });
  }

  evaluate(email) {
    for (const link of email.links) {
      if (!link.host) continue;
      const url = new URL(link.href);
      if (url.username || url.password) {
        return this.fire(
          `A link is disguised: it starts with "${url.username.slice(0, 60)}" but really goes to ${link.host}.`,
        );
      }
    }
    return null;
  }
}

import shorteners from '../data/shorteners.json' with { type: 'json' };
import { Signal } from '../Signal.js';

const SHORTENERS = new Set(shorteners);

/** S15: a link goes through a URL shortener, which hides its real destination. */
export class LinkShortenerSignal extends Signal {
  constructor() {
    super({ id: 'S15', name: 'LINK_SHORTENER', severity: 'low' });
  }

  evaluate(email) {
    const link = email.links.find(({ host }) => host && SHORTENERS.has(host.replace(/^www\./, '')));
    if (!link) return null;
    return this.fire(
      `A link uses the URL shortener ${link.host}, which hides where it really goes.`,
    );
  }
}

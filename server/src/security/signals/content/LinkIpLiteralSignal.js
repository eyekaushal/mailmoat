import { isIP } from 'node:net';
import { Signal } from '../Signal.js';

/**
 * S16: a link points at a raw IP address. The URL parser has already turned tricks like
 * `http://3232235777/` or `0x7f.1` into dotted form, so `isIP` sees through them.
 */
export class LinkIpLiteralSignal extends Signal {
  constructor() {
    super({ id: 'S16', name: 'LINK_IP_LITERAL', severity: 'medium' });
  }

  evaluate(email) {
    const link = email.links.find(({ host }) => host && isIP(host.replace(/^\[|\]$/g, '')) !== 0);
    if (!link) return null;
    return this.fire(`A link points to a raw IP address (${link.host}) instead of a domain name.`);
  }
}

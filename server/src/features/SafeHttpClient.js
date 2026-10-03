import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import https from 'node:https';
import { HttpError } from '../core/errors.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/**
 * The only way mailmoat talks to a URL taken from an email (PRD F9.3, SECURITY_APPROACH §8.8):
 * HTTPS only, no userinfo, default port, every hostname resolved first and every address
 * required to be public; the connection is pinned to the checked address so a DNS answer cannot
 * change between the check and the request. Redirects are followed by hand and re-checked.
 */
export class SafeHttpClient {
  #lookup;
  #send;
  #timeoutMs;
  #maxRedirects;
  #maxBodyBytes;

  /**
   * @param {{
   *   lookup?: typeof dns.lookup,
   *   send?: SafeHttpClient['send'] injectable transport for tests
   *   timeoutMs?: number, maxRedirects?: number, maxBodyBytes?: number,
   * }} [options]
   */
  constructor({
    lookup = (host, options) => dns.lookup(host, options),
    send,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  } = {}) {
    this.#lookup = lookup;
    this.#send = send ?? ((request) => this.#https(request));
    this.#timeoutMs = timeoutMs;
    this.#maxRedirects = maxRedirects;
    this.#maxBodyBytes = maxBodyBytes;
  }

  /**
   * @param {string} url
   * @param {{ body: string, headers?: Record<string, string> }} request
   * @returns {Promise<{ status: number, url: string, redirects: number }>} the final response
   * @throws {HttpError} when a URL fails the checks, on too many redirects, timeouts or network errors
   */
  async post(url, { body, headers = {} }) {
    let current = await this.check(url);
    let method = 'POST';
    let payload = body;
    for (let redirects = 0; ; redirects += 1) {
      const response = await this.#send({
        url: current.url,
        address: current.address,
        method,
        headers: {
          ...headers,
          ...(payload === null ? {} : { 'content-length': String(Buffer.byteLength(payload)) }),
        },
        body: payload,
      });
      const location = response.headers.location;
      if (!REDIRECTS.has(response.status) || !location) {
        return { status: response.status, url: current.url.href, redirects };
      }
      if (redirects === this.#maxRedirects) throw new HttpError('Too many redirects');
      current = await this.check(new URL(location, current.url).href);
      // 307/308 repeat the POST; the older codes turn into a GET (RFC 9110 §15.4).
      if (response.status !== 307 && response.status !== 308) {
        method = 'GET';
        payload = null;
      }
    }
  }

  /**
   * Validates a URL and resolves its host; every address must be public.
   * @param {string} url
   * @returns {Promise<{ url: URL, address: string }>} the address the connection must use
   * @throws {HttpError}
   */
  async check(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new HttpError('Malformed URL');
    }
    if (parsed.protocol !== 'https:') throw new HttpError('Only https URLs are allowed');
    if (parsed.username || parsed.password) throw new HttpError('URLs with userinfo are refused');
    if (parsed.port && parsed.port !== '443') throw new HttpError('Only port 443 is allowed');
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [host] : await this.#resolve(host);
    for (const address of addresses) {
      if (!SafeHttpClient.isPublicAddress(address)) {
        throw new HttpError('The host resolves to a private or reserved address');
      }
    }
    return { url: parsed, address: addresses[0] };
  }

  /**
   * @param {string} ip IPv4 or IPv6 literal
   * @returns {boolean} false for loopback, private, link-local, multicast, reserved and mapped forms
   */
  static isPublicAddress(ip) {
    const family = isIP(ip);
    if (family === 4) return SafeHttpClient.#publicV4(ip);
    if (family !== 6) return false;
    const lower = ip.toLowerCase();
    const embedded = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (embedded) return SafeHttpClient.#publicV4(embedded[1]);
    const words = SafeHttpClient.#expandV6(lower);
    if (!words) return false;
    const [w0, w1, w2, w3, w4, w5] = words;
    if (words.every((w) => w === 0)) return false; // ::
    if (words.slice(0, 7).every((w) => w === 0) && words[7] === 1) return false; // ::1
    if (words.slice(0, 5).every((w) => w === 0) && w5 === 0xffff) return false; // ::ffff:a.b.c.d (hex form)
    if (w0 === 0x64 && w1 === 0xff9b && w2 === 0 && w3 === 0 && w4 === 0 && w5 === 0) return false; // NAT64
    if ((w0 & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
    if ((w0 & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
    if ((w0 & 0xff00) === 0xff00) return false; // ff00::/8 multicast
    if (w0 === 0x2001 && w1 === 0x0db8) return false; // documentation
    if (w0 === 0 && words.slice(1, 6).every((w) => w === 0)) return false; // ::/96 compat
    return true;
  }

  async #resolve(host) {
    let results;
    try {
      results = await this.#lookup(host, { all: true, verbatim: true });
    } catch {
      throw new HttpError('The host could not be resolved');
    }
    const addresses = (Array.isArray(results) ? results : [results]).map((r) => r.address);
    if (addresses.length === 0) throw new HttpError('The host could not be resolved');
    return addresses;
  }

  static #publicV4(ip) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }

  /** @returns {number[] | null} eight 16-bit words */
  static #expandV6(ip) {
    const [head, tail = ''] = ip.split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    if (ip.includes('::') ? left.length + right.length > 7 : left.length !== 8) return null;
    const middle = ip.includes('::') ? Array(8 - left.length - right.length).fill('0') : [];
    const words = [...left, ...middle, ...right].map((w) => Number.parseInt(w, 16));
    return words.some(Number.isNaN) ? null : words;
  }

  /**
   * Default transport: `https.request` pinned to the checked address through the `lookup` option,
   * so TLS still verifies the hostname while the socket goes where the check said.
   * @param {{ url: URL, address: string, method: string, headers: Record<string, string>, body: string | null }} request
   * @returns {Promise<{ status: number, headers: Record<string, string>, body: string }>}
   */
  #https({ url, address, method, headers, body }) {
    const family = isIP(address);
    const pinned = (hostname, options, callback) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof options === 'object' && options.all) cb(null, [{ address, family }]);
      else cb(null, address, family);
    };
    return new Promise((resolve, reject) => {
      const req = https.request(
        url,
        { method, headers, lookup: pinned, timeout: this.#timeoutMs },
        (res) => {
          const chunks = [];
          let size = 0;
          res.on('data', (chunk) => {
            size += chunk.length;
            if (size > this.#maxBodyBytes) res.destroy();
            else chunks.push(chunk);
          });
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: Object.fromEntries(
                Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
              ),
              body: Buffer.concat(chunks).toString('utf8'),
            }),
          );
          res.on('error', (error) => reject(new HttpError('Response failed', { cause: error })));
        },
      );
      req.on('timeout', () => req.destroy(new HttpError('Request timed out')));
      req.on('error', (error) =>
        reject(
          error instanceof HttpError ? error : new HttpError('Request failed', { cause: error }),
        ),
      );
      req.end(body ?? undefined);
    });
  }
}

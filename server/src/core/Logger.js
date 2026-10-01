const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

// Field names are split into words ("refreshToken" → refresh, token) and matched per word,
// so "inputTokens" (a count) is not mistaken for a secret.
const SECRET_WORDS = new Set(['secret', 'token', 'key', 'password', 'authorization', 'cookie']);
const PERSONAL_WORDS = new Set([
  'body',
  'subject',
  'snippet',
  'content',
  'from',
  'to',
  'cc',
  'bcc',
  'address',
  'addresses',
  'email',
  'summary',
]);

const REDACTED = '[redacted]';

/**
 * Structured JSON logger.
 * Secrets are always redacted. Email content and addresses are redacted unless the
 * level is `debug`, which the user must turn on explicitly (SECURITY_APPROACH §9).
 */
export class Logger {
  #level;
  #sink;
  #context;
  #now;

  /**
   * @param {object} [options]
   * @param {'debug'|'info'|'warn'|'error'} [options.level]
   * @param {(line: string) => void} [options.sink] receives one JSON line per entry
   * @param {Record<string, unknown>} [options.context] fields added to every entry
   * @param {() => Date} [options.now]
   */
  constructor({
    level = 'info',
    sink = (line) => process.stderr.write(`${line}\n`),
    context = {},
    now = () => new Date(),
  } = {}) {
    if (!(level in LEVELS)) throw new RangeError(`Unknown log level: ${level}`);
    this.#level = level;
    this.#sink = sink;
    this.#context = context;
    this.#now = now;
  }

  /**
   * @param {Record<string, unknown>} context
   * @returns {Logger} a logger that adds `context` to every entry
   */
  child(context) {
    return new Logger({
      level: this.#level,
      sink: this.#sink,
      context: { ...this.#context, ...context },
      now: this.#now,
    });
  }

  debug(message, fields) {
    this.#write('debug', message, fields);
  }

  info(message, fields) {
    this.#write('info', message, fields);
  }

  warn(message, fields) {
    this.#write('warn', message, fields);
  }

  error(message, fields) {
    this.#write('error', message, fields);
  }

  #write(level, message, fields = {}) {
    if (LEVELS[level] < LEVELS[this.#level]) return;
    const entry = {
      time: this.#now().toISOString(),
      level,
      message,
      ...this.#redact({ ...this.#context, ...fields }),
    };
    this.#sink(JSON.stringify(entry));
  }

  #redact(value, key = '') {
    if (this.#isSecret(key)) return REDACTED;
    if (this.#level !== 'debug' && this.#isPersonal(key)) return REDACTED;
    if (value instanceof Error) return { name: value.name, message: value.message };
    if (Array.isArray(value)) return value.map((item) => this.#redact(item, key));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([childKey, child]) => [childKey, this.#redact(child, childKey)]),
      );
    }
    return value;
  }

  #isSecret(key) {
    return this.#words(key).some((word) => SECRET_WORDS.has(word));
  }

  #isPersonal(key) {
    return this.#words(key).some((word) => PERSONAL_WORDS.has(word));
  }

  /** "refreshToken" / "refresh_token" → ["refresh", "token"] */
  #words(key) {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }
}

/**
 * @typedef {{ type: 'user'|'planner'|'email'|'contacts'|'calendar'|'memory'|'inbox', id?: string }} Source
 *   `planner`: text the Planner produced that is not in the user's request
 * @typedef {'user-only'|'public'|Set<string>} Readers
 *   `user-only`: never leaves the app; `public`: anywhere the user sends it; a Set: only those
 *   addresses (the user is always an implicit reader).
 */

const READER_MODES = new Set(['user-only', 'public']);

/**
 * A runtime value with its provenance (SECURITY_APPROACH §7.6, PRD F12.3). Every value the agent
 * handles is one of these, so the Policy Engine can see where data came from and who may see it.
 * Combining values unions their sources and intersects their readers. Immutable.
 */
export class TaggedValue {
  /**
   * @param {unknown} value
   * @param {Source[]} sources at least one
   * @param {Readers | Iterable<string>} readers
   */
  constructor(value, sources, readers) {
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new TypeError('A TaggedValue needs at least one source');
    }
    this.value = value;
    this.sources = Object.freeze(sources.map(TaggedValue.#normaliseSource));
    this.readers = TaggedValue.#normaliseReaders(readers);
    Object.freeze(this);
  }

  /** Something the user typed: the user decides where it goes. */
  static fromUser(value) {
    return new TaggedValue(value, [{ type: 'user' }], 'public');
  }

  /**
   * Something taken from an email: readable by that email's participants and no one else.
   * @param {unknown} value
   * @param {{ id: string, participants: Iterable<string> }} email
   */
  static fromEmail(value, { id, participants }) {
    return new TaggedValue(value, [{ type: 'email', id }], participants);
  }

  /**
   * The user's own app data (contacts, calendar, memory, inbox listings): stays with the user.
   * @param {unknown} value
   * @param {'contacts'|'calendar'|'memory'|'inbox'} type
   */
  static fromOwnData(value, type) {
    return new TaggedValue(value, [{ type }], 'user-only');
  }

  /**
   * A value computed from several others.
   * @param {unknown} value
   * @param {TaggedValue[]} parts
   */
  static combine(value, parts) {
    if (parts.length === 0) throw new TypeError('combine needs at least one part');
    const seen = new Set();
    const sources = parts
      .flatMap((part) => part.sources)
      .filter((source) => {
        const key = `${source.type}:${source.id ?? ''}`;
        return seen.has(key) ? false : seen.add(key);
      });
    const readers = parts.map((part) => part.readers).reduce(TaggedValue.#intersectReaders);
    return new TaggedValue(value, sources, readers);
  }

  /** The same provenance around a new value (e.g. after parsing or formatting). */
  derive(value) {
    return new TaggedValue(value, [...this.sources], this.readers);
  }

  /** @param {Source['type']} type */
  hasSource(type) {
    return this.sources.some((source) => source.type === type);
  }

  /** True when every source is of this type, e.g. `onlySources('user')` for memory writes. */
  onlySources(type) {
    return this.sources.every((source) => source.type === type);
  }

  /** @returns {string[]} ids of the emails this value is derived from */
  emailIds() {
    return [...new Set(this.sources.filter((s) => s.type === 'email').map((s) => s.id))];
  }

  /** @param {string} address */
  isReadableBy(address) {
    if (this.readers === 'public') return true;
    if (this.readers === 'user-only') return false;
    return this.readers.has(address.toLowerCase());
  }

  /** Plain data for the audit log and approval previews. */
  toJSON() {
    return {
      value: this.value,
      sources: this.sources,
      readers: typeof this.readers === 'string' ? this.readers : [...this.readers].sort(),
    };
  }

  static #normaliseSource(source) {
    if (!source || typeof source.type !== 'string') {
      throw new TypeError('A source needs a string type');
    }
    if (source.type === 'email' && typeof source.id !== 'string') {
      throw new TypeError('An email source needs an id');
    }
    return Object.freeze(source.id === undefined ? { type: source.type } : { ...source });
  }

  static #normaliseReaders(readers) {
    if (typeof readers === 'string') {
      if (!READER_MODES.has(readers)) throw new TypeError(`Unknown readers mode: ${readers}`);
      return readers;
    }
    if (readers === null || typeof readers?.[Symbol.iterator] !== 'function') {
      throw new TypeError('readers must be "user-only", "public" or a list of addresses');
    }
    const set = new Set([...readers].map((address) => String(address).toLowerCase()));
    // No external reader at all is the same as user-only; one spelling keeps policy checks simple.
    return set.size === 0 ? 'user-only' : Object.freeze(set);
  }

  static #intersectReaders(a, b) {
    if (a === 'user-only' || b === 'user-only') return 'user-only';
    if (a === 'public') return b;
    if (b === 'public') return a;
    return new Set([...a].filter((address) => b.has(address)));
  }
}

import { HANDLE_FIELDS, HANDLE_PATTERN } from '@mailmoat/shared/schemas/plan';
import { HandleError } from '../core/errors.js';
import { TaggedValue } from './TaggedValue.js';

/**
 * Maps opaque handles such as `$email_18f3.summary` to the tagged text behind them
 * (SECURITY_APPROACH §7.5). The Planner only ever sees the handle; the interpreter resolves it
 * when a tool needs the text. Bodies are fetched on demand, so a handle may be registered with a
 * loader instead of a value. One store per planning session.
 */
export class HandleStore {
  /** @type {Map<string, { tagged: TaggedValue | null, load: (() => Promise<TaggedValue>) | null }>} */
  #entries = new Map();

  /**
   * @param {string} gmailId
   * @param {'summary'|'body'} field
   * @returns {string}
   */
  static emailHandle(gmailId, field) {
    const handle = `$email_${gmailId}.${field}`;
    if (!HANDLE_FIELDS.includes(field) || !HANDLE_PATTERN.test(handle)) {
      throw new HandleError(`Cannot build a handle for field "${field}"`);
    }
    return handle;
  }

  /**
   * @param {string} handle
   * @returns {{ kind: 'email', id: string, field: 'summary'|'body' }}
   * @throws {HandleError} for anything that is not a well-formed handle
   */
  static parse(handle) {
    if (typeof handle !== 'string' || !HANDLE_PATTERN.test(handle)) {
      throw new HandleError('Malformed handle');
    }
    const [, id, field] = /^\$email_(.+)\.(summary|body)$/.exec(handle);
    return { kind: 'email', id, field: /** @type {'summary'|'body'} */ (field) };
  }

  /**
   * @param {string} handle
   * @param {TaggedValue | (() => Promise<TaggedValue>)} source a value, or a loader called once
   * @throws {HandleError} for a malformed or already registered handle
   */
  register(handle, source) {
    HandleStore.parse(handle);
    if (this.#entries.has(handle)) throw new HandleError(`Handle already registered: ${handle}`);
    if (source instanceof TaggedValue) {
      this.#entries.set(handle, { tagged: source, load: null });
    } else if (typeof source === 'function') {
      this.#entries.set(handle, { tagged: null, load: source });
    } else {
      throw new HandleError('A handle needs a TaggedValue or a loader');
    }
  }

  /** @param {string} handle */
  has(handle) {
    return this.#entries.has(handle);
  }

  /** @returns {string[]} */
  handles() {
    return [...this.#entries.keys()];
  }

  /**
   * @param {string} handle
   * @returns {Promise<TaggedValue>}
   * @throws {HandleError} unknown handle, or a loader that failed or returned untagged data
   */
  async resolve(handle) {
    const entry = this.#entries.get(handle);
    if (!entry) throw new HandleError('Unknown handle');
    if (entry.tagged) return entry.tagged;
    let tagged;
    try {
      tagged = await entry.load();
    } catch (error) {
      throw new HandleError('Could not load the content behind a handle', { cause: error });
    }
    if (!(tagged instanceof TaggedValue)) {
      throw new HandleError('A handle loader must return a TaggedValue');
    }
    entry.tagged = tagged;
    entry.load = null;
    return tagged;
  }
}

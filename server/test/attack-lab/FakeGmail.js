import { NotFoundError } from '../../src/core/errors.js';

/**
 * In-memory Gmail for the attack lab: serves the corpus emails as raw messages and reports every
 * write (labels, archive) to the {@link RecordingToolbox}, so the lab can prove that handling an
 * attack email touched nothing else. Implements the GmailClient methods the pipeline uses.
 */
export class FakeGmail {
  #toolbox;
  #messages = new Map();
  #labelIds = new Map();

  /** @param {import('./RecordingToolbox.js').RecordingToolbox} toolbox */
  constructor(toolbox) {
    this.#toolbox = toolbox;
  }

  /** @param {{ id: string, raw: Buffer, internalDate: Date }} message */
  addMessage({ id, raw, internalDate }) {
    this.#messages.set(id, {
      id,
      threadId: `thread-${id}`,
      labelIds: ['INBOX', 'UNREAD'],
      internalDate,
      raw,
    });
  }

  /** One message per thread in the corpus; enough for the thread route to work in the demo. */
  async getThread(threadId) {
    const messages = [...this.#messages.values()]
      .filter((message) => message.threadId === threadId)
      .map(({ id, threadId: thread, labelIds, internalDate }) => ({
        id,
        threadId: thread,
        labelIds: [...labelIds],
        internalDate,
      }))
      .sort((a, b) => a.internalDate - b.internalDate);
    if (messages.length === 0) throw new NotFoundError('Unknown thread');
    return { threadId, messages };
  }

  /** Demo stand-in for Gmail search: every word of the query must appear in the raw message. */
  async listMessageIds({ query = '', maxResults = 100 } = {}) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const ids = [...this.#messages.values()]
      .filter((message) => {
        const haystack = message.raw.toString('utf8').toLowerCase();
        return words.every((word) => haystack.includes(word));
      })
      .sort((a, b) => b.internalDate - a.internalDate)
      .slice(0, maxResults)
      .map((message) => message.id);
    return { ids, nextPageToken: undefined };
  }

  async getRawMessage(id) {
    const message = this.#messages.get(id);
    if (!message) throw Object.assign(new Error('Not Found'), { code: 404 });
    return { ...message, labelIds: [...message.labelIds] };
  }

  async ensureLabel(name) {
    if (!this.#labelIds.has(name)) this.#labelIds.set(name, `Label_${this.#labelIds.size + 1}`);
    return this.#labelIds.get(name);
  }

  async modifyLabels(messageId, { add = [], remove = [] }) {
    this.#toolbox.record({ kind: 'label', target: messageId, detail: { add, remove } });
    const message = this.#messages.get(messageId);
    if (!message) return;
    message.labelIds = [...new Set([...message.labelIds, ...add])].filter(
      (id) => !remove.includes(id),
    );
  }

  async archive(messageId) {
    this.#toolbox.record({ kind: 'archive', target: messageId });
    await this.modifyLabels(messageId, { remove: ['INBOX'] });
  }

  /** @returns {string[]} label *names* currently on the message (for assertions) */
  labelsOf(messageId) {
    const names = new Map([...this.#labelIds].map(([name, id]) => [id, name]));
    return (this.#messages.get(messageId)?.labelIds ?? []).map((id) => names.get(id) ?? id);
  }
}

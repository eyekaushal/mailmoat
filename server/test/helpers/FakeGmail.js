import { HistoryExpiredError, NotFoundError } from '../../src/core/errors.js';

/**
 * In-memory stand-in for GmailClient's read methods, for sync tests.
 * Add messages with `addMessage`; new arrivals bump the history ID.
 */
export class FakeGmail {
  messages = new Map();
  /** @type {{ historyId: number, id: string }[]} */
  history = [];
  historyId = 100;
  historyExpired = false;
  metadataCalls = 0;
  deletedIds = new Set();

  addMessage({
    id,
    threadId = `t-${id}`,
    labelIds = ['INBOX', 'UNREAD'],
    from = 'Alice <alice@example.com>',
    to = 'me@gmail.com',
    subject = 'Hello',
    receivedAt = new Date('2026-10-01T10:00:00Z'),
    headers = {},
    snippet = 'Hello there &amp; welcome',
  }) {
    this.messages.set(id, {
      id,
      threadId,
      labelIds,
      internalDate: receivedAt,
      headers: { from, to, subject, ...headers },
      snippet,
    });
    this.historyId += 1;
    this.history.push({ historyId: this.historyId, id });
  }

  async getProfile() {
    return {
      email: 'me@gmail.com',
      historyId: String(this.historyId),
      messagesTotal: this.messages.size,
    };
  }

  async listHistory(startHistoryId) {
    if (this.historyExpired) {
      throw new HistoryExpiredError('expired');
    }
    const messageIds = this.history
      .filter((entry) => entry.historyId > Number(startHistoryId))
      .map((entry) => entry.id);
    return { messageIds, historyId: String(this.historyId), nextPageToken: undefined };
  }

  async getThread(threadId) {
    const messages = [...this.messages.values()]
      .filter((m) => m.threadId === threadId)
      .map(({ id, threadId: thread, labelIds, internalDate }) => ({
        id,
        threadId: thread,
        labelIds,
        internalDate,
      }))
      .sort((a, b) => a.internalDate - b.internalDate);
    if (messages.length === 0) throw new NotFoundError('Unknown thread');
    return { threadId, messages };
  }

  async listMessageIds({ query = '' } = {}) {
    const sentOnly = query.includes('in:sent') && !query.includes('-in:sent');
    const excludeSent = query.includes('-in:sent');
    const ids = [...this.messages.values()]
      .filter((m) => (sentOnly ? m.labelIds.includes('SENT') : true))
      .filter((m) => (excludeSent ? !m.labelIds.includes('SENT') : true))
      .map((m) => m.id);
    return { ids, nextPageToken: undefined };
  }

  async getMessageMetadata(id) {
    this.metadataCalls += 1;
    if (this.deletedIds.has(id) || !this.messages.has(id)) {
      throw Object.assign(new Error('Not Found'), { code: 404 });
    }
    return structuredClone(this.messages.get(id));
  }
}

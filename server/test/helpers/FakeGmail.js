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
  /** @type {{ draftId: string, messageId: string, threadId: string | null }[]} */
  drafts = [];
  deletedDrafts = [];

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

  /** Gmail itself changed a message's labels (archived, read): one history entry, no new mail. */
  changeLabels(id, labelIds) {
    const message = this.messages.get(id);
    if (message) message.labelIds = labelIds;
    this.historyId += 1;
    this.history.push({ historyId: this.historyId, id, labelIds });
  }

  async listHistory(startHistoryId) {
    if (this.historyExpired) {
      throw new HistoryExpiredError('expired');
    }
    const entries = this.history.filter((entry) => entry.historyId > Number(startHistoryId));
    return {
      messageIds: entries.filter((entry) => !entry.labelIds).map((entry) => entry.id),
      labelChanges: entries
        .filter((entry) => entry.labelIds)
        .map(({ id, labelIds }) => ({ id, labelIds })),
      historyId: String(this.historyId),
      nextPageToken: undefined,
    };
  }

  async listDrafts() {
    return this.drafts.map((draft) => ({ ...draft }));
  }

  async deleteDraft(draftId) {
    this.deletedDrafts.push(draftId);
    this.drafts = this.drafts.filter((draft) => draft.draftId !== draftId);
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

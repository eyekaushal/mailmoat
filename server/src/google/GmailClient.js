import { gmail } from '@googleapis/gmail';
import { HistoryExpiredError } from '../core/errors.js';

/**
 * Small Gmail API surface used by mailmoat. Everything else in the app talks to this class,
 * never to the Google SDK directly. Message content returned here is untrusted.
 */
export class GmailClient {
  #googleAuth;
  #createApi;
  #api;
  /** @type {Map<string, string>} label name → id */
  #labelIds = new Map();

  /**
   * @param {{ getAuthClient(): object }} googleAuth
   * @param {{ createApi?: (auth: object) => object }} [options] injectable for tests
   */
  constructor(googleAuth, { createApi = (auth) => gmail({ version: 'v1', auth }) } = {}) {
    this.#googleAuth = googleAuth;
    this.#createApi = createApi;
  }

  /** @returns {Promise<{ email: string, historyId: string, messagesTotal: number }>} */
  async getProfile() {
    const { data } = await this.#users().getProfile({ userId: 'me' });
    return {
      email: data.emailAddress,
      historyId: data.historyId,
      messagesTotal: data.messagesTotal,
    };
  }

  /**
   * IDs of messages added since `startHistoryId`.
   * @returns {Promise<{ messageIds: string[], historyId: string, nextPageToken?: string }>}
   * @throws {HistoryExpiredError} when Gmail no longer keeps history that old
   */
  async listHistory(startHistoryId, pageToken) {
    try {
      const { data } = await this.#users().history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
        pageToken,
      });
      const ids = (data.history ?? []).flatMap((entry) =>
        (entry.messagesAdded ?? []).map((added) => added.message.id),
      );
      return {
        messageIds: [...new Set(ids)],
        historyId: data.historyId,
        nextPageToken: data.nextPageToken ?? undefined,
      };
    } catch (error) {
      if (error?.code === 404 || error?.status === 404) {
        throw new HistoryExpiredError('Gmail history expired; a fresh sync is needed', {
          cause: error,
        });
      }
      throw error;
    }
  }

  /**
   * @param {{ query?: string, pageToken?: string, maxResults?: number }} options Gmail search query
   * @returns {Promise<{ ids: string[], nextPageToken?: string }>}
   */
  async listMessageIds({ query, pageToken, maxResults = 100 } = {}) {
    const { data } = await this.#users().messages.list({
      userId: 'me',
      q: query,
      pageToken,
      maxResults,
    });
    return {
      ids: (data.messages ?? []).map((message) => message.id),
      nextPageToken: data.nextPageToken ?? undefined,
    };
  }

  /**
   * The full RFC 822 message, for the security pipeline to parse itself.
   * @returns {Promise<{ id: string, threadId: string, labelIds: string[], internalDate: Date, raw: Buffer }>}
   */
  async getRawMessage(id) {
    const { data } = await this.#users().messages.get({ userId: 'me', id, format: 'raw' });
    return {
      id: data.id,
      threadId: data.threadId,
      labelIds: data.labelIds ?? [],
      internalDate: new Date(Number(data.internalDate)),
      raw: Buffer.from(data.raw, 'base64url'),
    };
  }

  /** @returns {Promise<string>} the label ID, creating the label if needed */
  async ensureLabel(name) {
    if (this.#labelIds.size === 0) {
      const { data } = await this.#users().labels.list({ userId: 'me' });
      for (const label of data.labels ?? []) this.#labelIds.set(label.name, label.id);
    }
    if (!this.#labelIds.has(name)) {
      const { data } = await this.#users().labels.create({
        userId: 'me',
        requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
      });
      this.#labelIds.set(name, data.id);
    }
    return this.#labelIds.get(name);
  }

  /** @param {{ add?: string[], remove?: string[] }} labelIds */
  async modifyLabels(messageId, { add = [], remove = [] }) {
    await this.#users().messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds: add, removeLabelIds: remove },
    });
  }

  /** Archiving in Gmail = removing the INBOX label (reversible). */
  async archive(messageId) {
    await this.modifyLabels(messageId, { remove: ['INBOX'] });
  }

  /**
   * @param {{ raw: Buffer, threadId?: string }} message complete RFC 822 message
   * @returns {Promise<string>} draft ID
   */
  async createDraft({ raw, threadId }) {
    const { data } = await this.#users().drafts.create({
      userId: 'me',
      requestBody: { message: { raw: raw.toString('base64url'), threadId } },
    });
    return data.id;
  }

  async deleteDraft(draftId) {
    await this.#users().drafts.delete({ userId: 'me', id: draftId });
  }

  /**
   * Sends a message. Only the ActionExecutor may call this, after the Policy Engine allowed it.
   * @param {{ raw: Buffer, threadId?: string }} message
   * @returns {Promise<string>} sent message ID
   */
  async sendMessage({ raw, threadId }) {
    const { data } = await this.#users().messages.send({
      userId: 'me',
      requestBody: { raw: raw.toString('base64url'), threadId },
    });
    return data.id;
  }

  #users() {
    this.#api ??= this.#createApi(this.#googleAuth.getAuthClient());
    return this.#api.users;
  }
}

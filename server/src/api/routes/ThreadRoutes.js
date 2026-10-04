import { Router } from 'express';
import { GmailIdParamSchema } from '@mailmoat/shared/schemas/api';
import { IngestError } from '../../core/errors.js';
import { Avatar } from '../Avatar.js';
import { validate } from '../validate.js';

/**
 * The reading view's conversation (PLAN §13.4): every message of a Gmail thread, fetched and
 * ingested when the user opens it. Nothing but the ≤ 160-character snippet is stored; the browser
 * gets visible text, disarmed links (text + host, never a live anchor) and attachment metadata.
 * A message that cannot be parsed is reported as unreadable rather than hiding the thread.
 */
export class ThreadRoutes {
  #deps;

  /**
   * @param {{
   *   gmail: Pick<import('../../google/GmailClient.js').GmailClient, 'getThread'|'getRawMessage'>,
   *   ingestor: Pick<import('../../security/ingest/EmailIngestor.js').EmailIngestor, 'ingest'>,
   *   emails: Pick<import('../../db/repositories/EmailRepository.js').EmailRepository, 'has'|'setSnippet'>,
   *   verdicts: Pick<import('../../db/repositories/VerdictRepository.js').VerdictRepository, 'get'>,
   * }} deps
   */
  constructor(deps) {
    this.#deps = deps;
  }

  router() {
    const { gmail } = this.#deps;
    const router = Router();

    router.get('/threads/:id', async (request, response) => {
      const { id } = validate(GmailIdParamSchema, request.params);
      const thread = await gmail.getThread(id);
      const messages = await Promise.all(thread.messages.map((message) => this.#view(message)));
      response.json({ threadId: thread.threadId, messages });
    });
    return router;
  }

  async #view(message) {
    const { gmail, ingestor, emails, verdicts } = this.#deps;
    const base = {
      gmailId: message.id,
      direction: message.labelIds.includes('SENT') ? 'outbound' : 'inbound',
      date: message.internalDate.toISOString(),
      isRead: !message.labelIds.includes('UNREAD'),
      verdict: verdicts.get(message.id) ?? null,
    };
    const { raw } = await gmail.getRawMessage(message.id);
    let email;
    try {
      email = await ingestor.ingest(raw);
    } catch (error) {
      if (!(error instanceof IngestError)) throw error;
      return { ...base, unreadable: true };
    }
    // Messages outside the backfill window have no row; the snippet is kept only for stored ones.
    if (emails.has(message.id)) emails.setSnippet(message.id, email.snippet);
    return {
      ...base,
      unreadable: false,
      from: email.from,
      to: email.to,
      cc: email.cc,
      subject: email.subject,
      text: email.readerText,
      textTruncated: email.readerTextTruncated,
      links: email.links.map(({ href, text, host }) => ({ href, text, host })),
      attachments: email.attachments,
      avatar: Avatar.for({ name: email.from?.name, address: email.from?.address ?? '' }),
    };
  }
}

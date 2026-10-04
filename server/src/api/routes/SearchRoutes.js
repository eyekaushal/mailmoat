import { Router } from 'express';
import { SearchQuerySchema } from '@mailmoat/shared/schemas/api';
import { Avatar } from '../Avatar.js';
import { validate } from '../validate.js';

const PAGE_SIZE = 25;

/**
 * Live Gmail search (PLAN §13.1 decision 2): the user's query goes to Gmail, which costs no money
 * (quota only), and the matching ids come back as inbox rows with the local verdict, category and
 * rules. Matches the backfill never stored are imported as metadata first, without running the
 * pipeline, so they appear with no verdict rather than disappearing.
 */
export class SearchRoutes {
  #deps;

  /**
   * @param {{
   *   gmail: Pick<import('../../google/GmailClient.js').GmailClient, 'listMessageIds'>,
   *   importer: Pick<import('../../sync/MessageImporter.js').MessageImporter, 'import'>,
   *   emails: Pick<import('../../db/repositories/EmailRepository.js').EmailRepository, 'listByIds'>,
   * }} deps
   */
  constructor(deps) {
    this.#deps = deps;
  }

  router() {
    const { gmail, importer, emails } = this.#deps;
    const router = Router();

    router.get('/search', async (request, response) => {
      const { q, cursor } = validate(SearchQuerySchema, request.query);
      const page = await gmail.listMessageIds({
        query: q,
        pageToken: cursor,
        maxResults: PAGE_SIZE,
      });
      await importer.import(page.ids, { pending: false });
      const byId = new Map(emails.listByIds(page.ids).map((item) => [item.gmailId, item]));
      // Gmail's order is the result order; spam, trash and drafts were never stored and drop out.
      const items = page.ids
        .filter((id) => byId.has(id))
        .map((id) => ({ ...byId.get(id), avatar: Avatar.for(SearchRoutes.#who(byId.get(id))) }));
      response.json({ query: q, items, nextCursor: page.nextPageToken ?? null });
    });
    return router;
  }

  static #who(item) {
    return { name: item.fromName, address: item.fromAddr };
  }
}

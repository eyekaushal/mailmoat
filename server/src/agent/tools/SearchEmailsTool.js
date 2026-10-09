import { z } from 'zod';
import { RISK_LEVELS } from '@mailmoat/shared/constants/risk-levels';
import { EmailFacts } from '../EmailFacts.js';
import { TaggedValue } from '../TaggedValue.js';
import { Tool } from './Tool.js';

const MAX_RESULTS = 50;
const SCAN_LIMIT = 500;

/** Finds emails by typed metadata. The listing is the user's own data (user-only). */
export class SearchEmailsTool extends Tool {
  #emails;
  #verdicts;

  /**
   * @param {{
   *   emails: Pick<import('../../db/repositories/EmailRepository.js').EmailRepository, 'search'>,
   *   verdicts: Pick<import('../../db/repositories/VerdictRepository.js').VerdictRepository, 'get'|'readerForm'>,
   * }} deps
   */
  constructor({ emails, verdicts }) {
    super({
      name: 'search_emails',
      description:
        'Find emails by sender (name, address or domain), direction, time range, risk or whether they need a reply. Returns typed facts, newest first; contacts the user writes to come first.',
      args: z.strictObject({
        from: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .optional()
          .describe(
            'The sender as the user named them: a name ("Neha", "Neha Kulkarni"), an address or a domain, exactly as the user wrote it. Matching happens in code.',
          ),
        direction: z
          .enum(['inbound', 'outbound'])
          .optional()
          .describe('"inbound" = received by the user, "outbound" = sent by the user.'),
        since: z.iso
          .datetime({ offset: true })
          .optional()
          .describe('Only emails received at or after this ISO 8601 time.'),
        until: z.iso
          .datetime({ offset: true })
          .optional()
          .describe('Only emails received at or before this ISO 8601 time.'),
        risk: z.enum(RISK_LEVELS).optional().describe('Only emails with this risk level.'),
        needs_reply: z
          .boolean()
          .optional()
          .describe('Only emails the Reader marked as needing a reply.'),
        limit: z
          .int()
          .min(1)
          .max(MAX_RESULTS)
          .optional()
          .describe(`Maximum results (1–${MAX_RESULTS}, default 10).`),
      }),
    });
    this.#emails = emails;
    this.#verdicts = verdicts;
  }

  async execute(args) {
    const value = (name) => args[name]?.value;
    const limit = value('limit') ?? 10;
    const matches = [];
    const records = this.#emails.search({
      sender: value('from'),
      direction: value('direction'),
      since: value('since'),
      until: value('until'),
      limit: SCAN_LIMIT,
    });
    for (const record of records) {
      const form = this.#verdicts.readerForm(record.gmailId) ?? null;
      const verdict = this.#verdicts.get(record.gmailId) ?? null;
      const facts = EmailFacts.from({ record, form, verdict });
      if (value('risk') !== undefined && facts.risk?.level !== value('risk')) continue;
      if (value('needs_reply') !== undefined && facts.needs_reply !== value('needs_reply'))
        continue;
      matches.push({ ...facts, summary: form?.summary ?? null });
      if (matches.length === limit) break;
    }
    // Distinct sender addresses in rank order (contacts first): the answer line says when a
    // name matched more than one person. Addresses only; names never leave the database.
    const senders = [...new Set(matches.map((m) => m.from.address).filter(Boolean))];
    return new TaggedValue(
      { count: matches.length, emails: matches, senders },
      [{ type: 'inbox' }, ...matches.map((m) => ({ type: 'email', id: m.id }))],
      'user-only',
    );
  }
}

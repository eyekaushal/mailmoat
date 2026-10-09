import { VALID_FORM } from '../../../shared/test/schemas/fixtures.js';

/** A stored inbound email from a colleague, as the repositories return it. */
export const RECORD = Object.freeze({
  gmailId: '18f3a',
  threadId: 't1',
  direction: 'inbound',
  fromAddr: 'rahul@acme.example',
  fromDomain: 'acme.example',
  fromName: 'Rahul Mehta',
  toAddrs: ['me@example.com'],
  recipientNames: {},
  date: '2026-10-05T09:00:00.000Z',
  subjectHash: 'abc',
  hasListUnsubscribe: false,
  unsubscribeUrl: null,
  oneClick: false,
  labels: ['INBOX', 'UNREAD'],
  isRead: false,
});

export const FORM = VALID_FORM;
export const VERDICT = Object.freeze({ level: 'SAFE', score: 0, reasons: [], floor: 'SAFE' });

/** Repository fakes holding the given emails (`{ record, form, verdict }`). */
export function fakeRepos(emails = [{ record: RECORD, form: FORM, verdict: VERDICT }]) {
  const byId = new Map(emails.map((e) => [e.record.gmailId, e]));
  return {
    emails: {
      get: (id) => byId.get(id)?.record,
      search: ({ from, sender, direction, since, until, limit }) =>
        emails
          .map((e) => e.record)
          .filter((r) => !from || r.fromAddr === from || r.fromDomain === from)
          .filter((r) => {
            if (!sender) return true;
            const haystack = `${r.fromName ?? ''} ${r.fromAddr} ${r.fromDomain}`.toLowerCase();
            return sender
              .toLowerCase()
              .split(/\s+/)
              .every((word) => haystack.includes(word));
          })
          .filter((r) => !direction || r.direction === direction)
          .filter((r) => !since || r.date >= since)
          .filter((r) => !until || r.date <= until)
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .slice(0, limit),
    },
    verdicts: {
      get: (id) => byId.get(id)?.verdict ?? undefined,
      readerForm: (id) => byId.get(id)?.form ?? undefined,
    },
  };
}

/** Records every call so tests can assert exactly what reached Google. */
export function recordingGmail() {
  const calls = [];
  return {
    calls,
    async ensureLabel(name) {
      calls.push(['ensureLabel', name]);
      return `Label_${name}`;
    },
    async modifyLabels(id, change) {
      calls.push(['modifyLabels', id, change]);
    },
    async archive(id) {
      calls.push(['archive', id]);
    },
    async createDraft({ raw, threadId }) {
      calls.push(['createDraft', raw.toString('utf8'), threadId]);
      return 'draft-1';
    },
    async sendMessage({ raw, threadId }) {
      calls.push(['sendMessage', raw.toString('utf8'), threadId]);
      return 'sent-1';
    },
  };
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SearchRoutes } from '../../../../src/api/routes/SearchRoutes.js';
import { Database } from '../../../../src/db/Database.js';
import { Migrator } from '../../../../src/db/Migrator.js';
import { EmailRepository } from '../../../../src/db/repositories/EmailRepository.js';
import { RuleRepository } from '../../../../src/db/repositories/RuleRepository.js';
import { VerdictRepository } from '../../../../src/db/repositories/VerdictRepository.js';
import { startApi } from '../../../helpers/apiServer.js';
import { storeEmail } from '../../../helpers/inboxFixtures.js';

let db;
let repos;
let api;
let queries;
let imported;

beforeEach(async () => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
  const rules = new RuleRepository(db);
  rules.seed([{ id: 'fyi', name: 'FYI', actions: ['label'], isSecurity: false }]);
  repos = { emails: new EmailRepository(db), verdicts: new VerdictRepository(db), rules };
  queries = [];
  imported = [];
  api = await startApi({
    routes: [
      new SearchRoutes({
        gmail: {
          listMessageIds: async (options) => {
            queries.push(options);
            return options.pageToken
              ? { ids: ['older'], nextPageToken: undefined }
              : { ids: ['b', 'spam', 'old', 'a'], nextPageToken: 'page2' };
          },
        },
        importer: {
          import: async (ids, options) => {
            imported.push([ids, options]);
            // "old" is outside the backfill window: the importer stores its metadata now.
            if (ids.includes('old')) storeEmail(repos, 'old', { fromName: 'Old Sender' });
            return ids.includes('old') ? 1 : 0;
          },
        },
        emails: repos.emails,
      }),
    ],
  });
});

afterEach(() => api.close());

describe('GET /api/search', () => {
  it('runs the query on Gmail, imports unknown matches and returns inbox rows in Gmail order', async () => {
    storeEmail(repos, 'a', { ruleIds: ['fyi'], fromName: 'Rahul Mehta' });
    storeEmail(repos, 'b', { level: 'DANGEROUS', score: 90, reasons: ['x'] });
    const response = await api.get('/api/search?q=deck%20from%3Arahul');
    expect(response.status).toBe(200);
    expect(queries).toEqual([{ query: 'deck from:rahul', pageToken: undefined, maxResults: 25 }]);
    expect(imported).toEqual([[['b', 'spam', 'old', 'a'], { pending: false }]]);
    const { query, items, nextCursor } = response.json;
    expect(query).toBe('deck from:rahul');
    expect(nextCursor).toBe('page2');
    // spam was never stored (skipped by the mapper), so it drops out.
    expect(items.map((i) => i.gmailId)).toEqual(['b', 'old', 'a']);
    expect(items[0]).toMatchObject({ verdict: { level: 'DANGEROUS' }, rules: [] });
    expect(items[1]).toMatchObject({ avatar: { initials: 'OS' } });
    expect(items[2]).toMatchObject({ rules: ['fyi'], avatar: { initials: 'RM' }, subject: '' });
    expect(JSON.stringify(items)).not.toContain('"body"');
  });

  it('passes the cursor to Gmail as the page token', async () => {
    storeEmail(repos, 'older');
    const response = await api.get('/api/search?q=deck&cursor=page2');
    expect(queries[0]).toMatchObject({ pageToken: 'page2' });
    expect(response.json.items.map((i) => i.gmailId)).toEqual(['older']);
    expect(response.json.nextCursor).toBeNull();
  });

  it('validates the query', async () => {
    expect((await api.get('/api/search')).status).toBe(400);
    expect((await api.get('/api/search?q=%20%20')).status).toBe(400);
    expect((await api.get(`/api/search?q=${'a'.repeat(501)}`)).status).toBe(400);
    expect(queries).toEqual([]);
  });
});

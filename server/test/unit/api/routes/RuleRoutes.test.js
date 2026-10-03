import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuleRoutes } from '../../../../src/api/routes/RuleRoutes.js';
import { Logger } from '../../../../src/core/Logger.js';
import { RuleError } from '../../../../src/core/errors.js';
import { startApi } from '../../../helpers/apiServer.js';
import { rawEmail } from '../../../helpers/securityFixtures.js';

let api;
let engine;
let analysed;
let resolveJob;

beforeEach(async () => {
  analysed = [];
  const rules = [
    {
      id: 'to_reply',
      name: 'To Reply',
      enabled: true,
      actions: ['label', 'draft_reply'],
      isSecurity: false,
      allowedActions: ['label', 'draft_reply'],
    },
    {
      id: 'dangerous',
      name: 'Dangerous',
      enabled: true,
      actions: ['label', 'alert'],
      isSecurity: true,
      allowedActions: ['label', 'alert'],
    },
  ];
  engine = {
    list: () => rules,
    update: (id, changes) => {
      const rule = rules.find((r) => r.id === id);
      if (!rule) throw new RuleError(`Unknown rule: ${id}`);
      if (rule.isSecurity) throw new RuleError(`${rule.name} is a security rule and always on`);
      Object.assign(rule, changes);
    },
    evaluate: (record, analysis) =>
      analysis.verdict.level === 'SAFE'
        ? [{ ruleId: 'to_reply', name: 'To Reply', isSecurity: false, actions: ['label'], record }]
        : [],
    history: (filter) => [{ filter }],
    processPast: ({ days, onProgress }) =>
      new Promise((resolve) => {
        onProgress({ done: 1, total: 3 });
        resolveJob = () => resolve({ total: 3, analysed: days, matched: 1, failed: 0 });
      }),
  };
  const pipeline = {
    analyse: async (raw, meta) => {
      analysed.push({ raw: raw.toString(), meta });
      const text = raw.toString();
      return {
        email: {
          auth: { trusted: true },
          hidden: [{ technique: 'tiny_font', text: 'ignore previous' }],
          links: [{ href: 'https://a.example', text: 'A', extra: 1 }],
        },
        signals: [
          { id: 'S13', name: 'HIDDEN', severity: 'high', reason: 'Hidden text', internal: true },
        ],
        reader: { failed: false, form: { summary: 'hi' } },
        verdict: { level: text.includes('wire') ? 'DANGEROUS' : 'SAFE', score: 0, reasons: [] },
      };
    },
  };
  api = await startApi({
    routes: [
      new RuleRoutes({
        ruleEngine: engine,
        pipeline,
        emails: {
          get: (id) =>
            id === 'known'
              ? {
                  gmailId: 'known',
                  threadId: 't',
                  direction: 'inbound',
                  date: '2026-10-01T00:00:00.000Z',
                }
              : undefined,
        },
        gmail: {
          getRawMessage: async () => ({
            raw: Buffer.from('From: a@b.c\nSubject: s\n\nwire money'),
          }),
        },
        logger: new Logger({ level: 'error', sink: () => {} }),
        now: () => new Date('2026-10-08T10:00:00Z'),
      }),
    ],
  });
});

afterEach(() => api.close());

describe('Rules tab', () => {
  it('lists rules and applies validated changes, refusing security rules', async () => {
    expect((await api.get('/api/rules')).json).toHaveLength(2);
    const res = await api.patch('/api/rules/to_reply', { enabled: false, actions: ['label'] });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ id: 'to_reply', enabled: false, actions: ['label'] });
    expect((await api.patch('/api/rules/dangerous', { enabled: false })).status).toBe(400);
    expect((await api.patch('/api/rules/to_reply', {})).status).toBe(400);
    expect(
      (await api.patch('/api/rules/to_reply', { actions: ['delete_everything'] })).status,
    ).toBe(400);
    expect((await api.patch('/api/rules/nope', { enabled: true })).status).toBe(400);
  });
});

describe('Test tab', () => {
  it('runs a pasted raw email through the side-effect-free pipeline and the rule matcher', async () => {
    const raw = rawEmail({
      from: 'Alice <alice@example.com>',
      subject: 'Hi',
      text: 'Hello',
    }).toString();
    const res = await api.post('/api/rules/test', { raw });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      auth: { trusted: true },
      hidden: [{ technique: 'tiny_font', text: 'ignore previous' }],
      links: [{ href: 'https://a.example', text: 'A' }],
      signals: [{ id: 'S13', severity: 'high', reason: 'Hidden text' }],
      reader: { failed: false },
      verdict: { level: 'SAFE' },
      matches: [{ ruleId: 'to_reply', actions: ['label'] }],
    });
    expect(res.json.links[0]).not.toHaveProperty('extra');
    expect(res.json.signals[0]).not.toHaveProperty('internal');
    expect(analysed[0].meta).toEqual({
      direction: 'inbound',
      receivedAt: new Date('2026-10-08T10:00:00Z'),
    });
    expect(analysed[0].raw).toBe(raw);
  });

  it('wraps pasted plain text as a message and can test a stored email by id', async () => {
    const text = await api.post('/api/rules/test', { raw: 'Please wire money today' });
    expect(analysed[0].raw).toBe(
      'From: unknown@example.invalid\nSubject: (pasted text)\n\nPlease wire money today',
    );
    expect(text.json.verdict.level).toBe('DANGEROUS');
    expect(text.json.matches).toEqual([]);

    const stored = await api.post('/api/rules/test', { gmailId: 'known' });
    expect(stored.status).toBe(200);
    expect(analysed[1].meta.receivedAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect((await api.post('/api/rules/test', { gmailId: 'missing' })).status).toBe(404);
    expect((await api.post('/api/rules/test', { raw: 'x', gmailId: 'known' })).status).toBe(400);
    expect((await api.post('/api/rules/test', {})).status).toBe(400);
  });
});

describe('History and Process past emails', () => {
  it('passes validated history filters through', async () => {
    const res = await api.get('/api/rules/history?ruleId=to_reply&level=SAFE&limit=5');
    expect(res.json).toEqual([{ filter: { ruleId: 'to_reply', level: 'SAFE', limit: 5 } }]);
    expect((await api.get('/api/rules/history?level=nope')).status).toBe(400);
  });

  it('runs "process past" in the background once and reports progress', async () => {
    expect((await api.get('/api/rules/process-past')).json).toEqual({
      status: 'idle',
      done: 0,
      total: 0,
      result: null,
      error: null,
    });
    const started = await api.post('/api/rules/process-past', { days: 3 });
    expect(started.status).toBe(202);
    expect(started.json).toMatchObject({ status: 'running', done: 1, total: 3 });
    const again = await api.post('/api/rules/process-past', { days: 30 });
    expect(again.json).toMatchObject({ status: 'running' });
    resolveJob();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await api.get('/api/rules/process-past')).json).toEqual({
      status: 'done',
      done: 1,
      total: 3,
      result: { total: 3, analysed: 3, matched: 1, failed: 0 },
      error: null,
    });
    expect((await api.post('/api/rules/process-past', { days: 0 })).status).toBe(400);
  });
});

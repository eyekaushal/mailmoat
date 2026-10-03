import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Router } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../../src/api/App.js';
import { SecurityMiddleware } from '../../../src/api/SecurityMiddleware.js';
import { Logger } from '../../../src/core/Logger.js';
import {
  ApprovalError,
  ChatError,
  LlmError,
  NotConnectedError,
  NotFoundError,
  ValidationError,
} from '../../../src/core/errors.js';
import { freePort, startApi } from '../../helpers/apiServer.js';

const failing = {
  router() {
    const router = Router();
    router.get('/throw/:kind', (request) => {
      const kinds = {
        validation: new ValidationError('bad input'),
        notfound: new NotFoundError('no such thing'),
        approval: new ApprovalError('already decided'),
        chat: new ChatError('Unknown chat'),
        llm: new LlmError('model down'),
        notconnected: new NotConnectedError('connect Google first'),
        crash: new TypeError('secret internals at /Users/k/db.sqlite'),
      };
      throw kinds[request.params.kind];
    });
    router.get('/async-throw', async () => {
      throw new ValidationError('async bad input');
    });
    router.post('/echo', (request, response) => response.json(request.body));
    return router;
  },
};

let api;
afterEach(async () => api?.close());

describe('App — error handling', () => {
  it('maps typed errors to statuses and keeps their messages', async () => {
    const lines = [];
    api = await startApi({
      routes: [failing],
      logger: new Logger({ level: 'warn', sink: (line) => lines.push(JSON.parse(line)) }),
    });
    const expected = {
      validation: [400, 'bad input'],
      notfound: [404, 'no such thing'],
      approval: [409, 'already decided'],
      chat: [400, 'Unknown chat'],
      llm: [502, 'model down'],
      notconnected: [409, 'connect Google first'],
    };
    for (const [kind, [status, message]] of Object.entries(expected)) {
      const res = await api.get(`/api/throw/${kind}`);
      expect(res.status, kind).toBe(status);
      expect(res.json).toEqual({ error: message });
    }
    expect((await api.get('/api/async-throw')).json).toEqual({ error: 'async bad input' });
    expect(lines.every((line) => line.level === 'warn')).toBe(true);
  });

  it('hides the details of unexpected errors from the client but logs them', async () => {
    const lines = [];
    api = await startApi({
      routes: [failing],
      logger: new Logger({ level: 'error', sink: (line) => lines.push(JSON.parse(line)) }),
    });
    const res = await api.get('/api/throw/crash');
    expect(res.status).toBe(500);
    expect(res.json).toEqual({ error: 'Internal error' });
    expect(res.text).not.toContain('db.sqlite');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'error', error: 'TypeError', status: 500 });
  });

  it('answers 404 JSON for unknown API routes and 400 for malformed JSON', async () => {
    api = await startApi({ routes: [failing] });
    expect((await api.get('/api/nope')).status).toBe(404);
    expect((await api.get('/api/nope')).json).toEqual({ error: 'No such API route' });
    const empty = await api.post('/api/echo', undefined, { 'content-type': 'application/json' });
    expect(empty.status).toBe(200); // no body at all is fine
    const malformed = await api.post('/api/echo', undefined, {}, '{not json');
    expect(malformed.status).toBe(400);
  });
});

describe('App — serving', () => {
  it('listens on 127.0.0.1 only and advertises no server software', async () => {
    api = await startApi({ routes: [failing] });
    const res = await api.get('/api/echo');
    expect(res.headers['x-powered-by']).toBeUndefined();
    const port = await freePort();
    const server = await new App({
      security: new SecurityMiddleware({ port }),
      routes: [],
      host: '127.0.0.1',
      port,
      logger: new Logger({ level: 'error', sink: () => {} }),
    }).listen();
    expect(server.address()).toMatchObject({ address: '127.0.0.1', port });
    await new Promise((resolve) => server.close(resolve));
  });

  it('serves the built UI with an SPA fallback, or a plain notice when it is not built', async () => {
    api = await startApi({ routes: [] });
    const notice = await api.get('/');
    expect(notice.status).toBe(200);
    expect(notice.text).toMatch(/web UI is not built/);
    await api.close();

    const dist = mkdtempSync(join(tmpdir(), 'mailmoat-dist-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>mailmoat</title>');
    api = await startApi({ routes: [], staticDir: dist });
    expect((await api.get('/')).text).toContain('<title>mailmoat</title>');
    expect((await api.get('/inbox/some/route')).text).toContain('<title>mailmoat</title>');
    expect((await api.get('/api/anything')).status).toBe(404);
  });
});

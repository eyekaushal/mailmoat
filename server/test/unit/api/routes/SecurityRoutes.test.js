import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SecurityRoutes } from '../../../../src/api/routes/SecurityRoutes.js';
import { Database } from '../../../../src/db/Database.js';
import { Migrator } from '../../../../src/db/Migrator.js';
import { AuditLogRepository } from '../../../../src/db/repositories/AuditLogRepository.js';
import { EmailRepository } from '../../../../src/db/repositories/EmailRepository.js';
import { VerdictRepository } from '../../../../src/db/repositories/VerdictRepository.js';
import { startApi } from '../../../helpers/apiServer.js';
import { storeEmail } from '../../../helpers/inboxFixtures.js';

const NOW = new Date('2026-10-08T10:00:00Z');
let api;
let repos;

beforeEach(async () => {
  const db = new Database(':memory:');
  new Migrator(db).migrate();
  repos = {
    emails: new EmailRepository(db),
    verdicts: new VerdictRepository(db),
    audit: new AuditLogRepository(db),
  };
  api = await startApi({
    routes: [
      new SecurityRoutes({
        verdicts: repos.verdicts,
        audit: repos.audit,
        approvals: { listPending: () => [1, 2] },
        now: () => NOW,
      }),
    ],
  });
});

afterEach(() => api.close());

describe('SecurityRoutes', () => {
  it('summarises the window: scanned, by level, injection attempts, policy outcomes', async () => {
    storeEmail(repos, 'a', { at: new Date('2026-10-07T00:00:00Z') });
    storeEmail(repos, 'b', { level: 'SUSPICIOUS', at: new Date('2026-10-06T00:00:00Z') });
    storeEmail(repos, 'c', {
      level: 'DANGEROUS',
      injectionAttempt: true,
      at: new Date('2026-10-05T00:00:00Z'),
    });
    storeEmail(repos, 'old', { level: 'DANGEROUS', at: new Date('2026-09-01T00:00:00Z') });
    repos.audit.append({
      ts: '2026-10-07T00:00:00Z',
      actor: 'system',
      event: 'policy_decision',
      decision: 'DENY',
    });
    repos.audit.append({
      ts: '2026-10-07T00:00:00Z',
      actor: 'system',
      event: 'policy_decision',
      decision: 'ASK',
    });
    repos.audit.append({
      ts: '2026-09-07T00:00:00Z',
      actor: 'system',
      event: 'policy_decision',
      decision: 'DENY',
    });
    const week = await api.get('/api/security/overview');
    expect(week.json).toEqual({
      days: 7,
      since: '2026-10-01T10:00:00.000Z',
      scanned: 3,
      safe: 1,
      suspicious: 1,
      dangerous: 1,
      injectionAttempts: 1,
      denied: 1,
      asked: 1,
      pendingApprovals: 2,
    });
    const month = await api.get('/api/security/overview?days=60');
    expect(month.json).toMatchObject({ days: 60, scanned: 4, dangerous: 2, denied: 2 });
    expect((await api.get('/api/security/overview?days=0')).status).toBe(400);
  });

  it('feeds non-SAFE emails with their reasons, newest first', async () => {
    storeEmail(repos, 'a');
    storeEmail(repos, 'b', {
      level: 'SUSPICIOUS',
      reasons: ['DMARC failed'],
      at: new Date('2026-10-06T00:00:00Z'),
    });
    storeEmail(repos, 'c', {
      level: 'DANGEROUS',
      reasons: ['Lookalike'],
      fromName: 'CEO',
      at: new Date('2026-10-07T00:00:00Z'),
    });
    const feed = await api.get('/api/security/feed?limit=5');
    expect(feed.json.map((e) => e.gmailId)).toEqual(['c', 'b']);
    expect(feed.json[0]).toMatchObject({
      level: 'DANGEROUS',
      reasons: ['Lookalike'],
      fromName: 'CEO',
      fromAddr: 'rahul@acme-corp.com',
      userFeedback: null,
    });
  });

  it('serves and exports the audit log with filters', async () => {
    repos.audit.append({
      ts: 't1',
      actor: 'system',
      event: 'policy_decision',
      subject: 'send_email',
      decision: 'DENY',
      reason: 'r',
    });
    repos.audit.append({ ts: 't2', actor: 'user', event: 'approval_decided', subject: 'a1' });
    expect((await api.get('/api/audit')).json.map((e) => e.event)).toEqual([
      'approval_decided',
      'policy_decision',
    ]);
    expect((await api.get('/api/audit?filter=policy_decision')).json).toHaveLength(1);
    expect((await api.get('/api/audit?subject=a1')).json).toHaveLength(1);
    expect((await api.get('/api/audit?filter=DROP%20TABLE')).status).toBe(400);
    const exported = await api.get('/api/audit/export');
    expect(exported.headers['content-disposition']).toBe(
      'attachment; filename="mailmoat-audit-2026-10-08.json"',
    );
    expect(exported.json.exportedAt).toBe('2026-10-08T10:00:00.000Z');
    expect(exported.json.entries).toHaveLength(2);
  });
});

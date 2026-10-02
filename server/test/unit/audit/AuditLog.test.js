import { beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../../../src/audit/AuditLog.js';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { AuditLogRepository } from '../../../src/db/repositories/AuditLogRepository.js';

let db;
let repository;

beforeEach(() => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
  repository = new AuditLogRepository(db);
});

describe('AuditLog', () => {
  it('appends timestamped entries and reads them newest first', () => {
    const log = new AuditLog(repository, () => new Date('2026-10-02T09:00:00Z'));
    log.record({ actor: 'system', event: 'llm_call', subject: 'reader', data: { costUsd: 0.001 } });
    log.record({ actor: 'user', event: 'mark_trusted', subject: 'm1' });

    expect(repository.recent()).toMatchObject([
      { event: 'mark_trusted', data: null },
      {
        ts: '2026-10-02T09:00:00.000Z',
        actor: 'system',
        event: 'llm_call',
        subject: 'reader',
        data: { costUsd: 0.001 },
      },
    ]);
    expect(repository.recent({ event: 'llm_call' })).toHaveLength(1);
  });

  it('cannot be changed or deleted', () => {
    new AuditLog(repository).record({ actor: 'system', event: 'x' });
    expect(() => db.run("UPDATE audit_log SET event = 'y'")).toThrow(/append-only/);
    expect(() => db.run('DELETE FROM audit_log')).toThrow(/append-only/);
  });
});

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MigrationError } from '../../../src/core/errors.js';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';

describe('Migrator', () => {
  it('applies the v1 schema once and is idempotent', () => {
    const db = new Database(':memory:');
    expect(new Migrator(db).migrate()).toEqual([
      '001_init.sql',
      '002_processing_queue.sql',
      '003_contact_names.sql',
      '004_verdict_injection.sql',
    ]);
    expect(new Migrator(db).migrate()).toEqual([]);
    const tables = db.all("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(['emails', 'verdicts', 'secrets', 'audit_log']));
  });

  it('keeps the database file usable across restarts', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'mailmoat-db-')), 'data', 'mailmoat.db');
    const first = new Database(file);
    new Migrator(first).migrate();
    first.close();
    const second = new Database(file);
    expect(new Migrator(second).migrate()).toEqual([]);
    second.close();
  });

  it('rolls back a failing migration completely', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mailmoat-migrations-'));
    writeFileSync(join(dir, '001_ok.sql'), 'CREATE TABLE a (x INTEGER);');
    writeFileSync(join(dir, '002_bad.sql'), 'CREATE TABLE b (x INTEGER); THIS IS NOT SQL;');
    const db = new Database(':memory:');
    expect(() => new Migrator(db, { dir }).migrate()).toThrow(MigrationError);
    const tables = db.all("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name);
    expect(tables).toContain('a');
    expect(tables).not.toContain('b');
  });

  it('enforces schema-level security rules', () => {
    const db = new Database(':memory:');
    new Migrator(db).migrate();
    db.run("INSERT INTO audit_log (ts, actor, event) VALUES ('t', 'system', 'test')");
    expect(() => db.run('DELETE FROM audit_log')).toThrow(/append-only/);
    expect(() => db.run("UPDATE audit_log SET event = 'x'")).toThrow(/append-only/);
    expect(() =>
      db.run("INSERT INTO memory (content, source, created_at) VALUES ('x', 'email', 't')"),
    ).toThrow();
  });
});

import { copyFileSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
      '005_verdict_feedback.sql',
      '006_email_text.sql',
      '007_to_reply_label_only.sql',
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

  it('007 resets a To Reply rule that still drafts on its own to label only (PLAN §14.1)', () => {
    const source = fileURLToPath(new URL('../../../src/db/migrations/', import.meta.url));
    const dir = mkdtempSync(join(tmpdir(), 'mailmoat-upgrade-'));
    for (const name of readdirSync(source).filter((f) => f < '007'))
      copyFileSync(join(source, name), join(dir, name));
    const db = new Database(':memory:');
    new Migrator(db, { dir }).migrate();
    db.run(
      "INSERT INTO rules (id, name, enabled, actions_json, is_security) VALUES ('to_reply', 'To Reply', 1, '[\"label\",\"draft_reply\"]', 0), ('fyi', 'FYI', 1, '[\"label\",\"draft_reply\"]', 0)",
    );
    expect(new Migrator(db).migrate()).toEqual(['007_to_reply_label_only.sql']);
    expect(db.get("SELECT actions_json AS a FROM rules WHERE id = 'to_reply'").a).toBe('["label"]');
    expect(db.get("SELECT actions_json AS a FROM rules WHERE id = 'fyi'").a).toBe(
      '["label","draft_reply"]',
    );
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

import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalData } from '../../../src/core/LocalData.js';

describe('LocalData', () => {
  it('removes the database, its side files and the master key, ignoring what is absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mailmoat-data-'));
    const databasePath = join(dir, 'mailmoat.db');
    const keyPath = join(dir, 'master.key');
    writeFileSync(databasePath, 'db');
    writeFileSync(`${databasePath}-wal`, 'wal');
    writeFileSync(keyPath, 'key');
    writeFileSync(join(dir, 'unrelated.txt'), 'keep');

    const removed = new LocalData({ databasePath, keyPath }).eraseAll();
    expect(removed).toEqual([databasePath, `${databasePath}-wal`, keyPath]);
    expect(existsSync(databasePath)).toBe(false);
    expect(existsSync(keyPath)).toBe(false);
    expect(existsSync(join(dir, 'unrelated.txt'))).toBe(true);
    expect(new LocalData({ databasePath, keyPath }).eraseAll()).toEqual([]);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { SettingsRepository } from '../../../src/db/repositories/SettingsRepository.js';
import { SyncStateRepository } from '../../../src/db/repositories/SyncStateRepository.js';

let db;

beforeEach(() => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
});

describe('SettingsRepository', () => {
  it('stores JSON values and returns a fallback when missing', () => {
    const settings = new SettingsRepository(db);
    expect(settings.get('pollIntervalSeconds', 60)).toBe(60);
    settings.set('pollIntervalSeconds', 30);
    settings.set('workingHours', { start: '09:00', end: '18:00' });
    expect(settings.get('pollIntervalSeconds', 60)).toBe(30);
    expect(settings.all()).toEqual({
      pollIntervalSeconds: 30,
      workingHours: { start: '09:00', end: '18:00' },
    });
  });
});

describe('SyncStateRepository', () => {
  it('starts empty and remembers where sync left off', () => {
    const sync = new SyncStateRepository(db);
    expect(sync.getHistoryId()).toBeNull();
    expect(sync.getLastPollAt()).toBeNull();
    sync.setHistoryId('12345');
    sync.markPolled(new Date('2026-10-01T10:00:00Z'));
    expect(sync.getHistoryId()).toBe('12345');
    expect(sync.getLastPollAt()).toEqual(new Date('2026-10-01T10:00:00Z'));
  });
});

describe('Database.transaction', () => {
  it('rolls back every write when the work throws', () => {
    const settings = new SettingsRepository(db);
    expect(() =>
      db.transaction(() => {
        settings.set('a', 1);
        throw new Error('stop');
      }),
    ).toThrow('stop');
    expect(settings.get('a')).toBeUndefined();
  });
});

import { rmSync } from 'node:fs';

/**
 * The files mailmoat keeps on this machine: the SQLite database (with its WAL side files) and
 * the master key that encrypts secrets. "Delete all local data" (PRD §9 Privacy) removes them.
 */
export class LocalData {
  #paths;

  /** @param {{ databasePath: string, keyPath: string }} paths */
  constructor({ databasePath, keyPath }) {
    this.#paths = [
      databasePath,
      `${databasePath}-wal`,
      `${databasePath}-shm`,
      `${databasePath}-journal`,
      keyPath,
    ];
  }

  /** Removes every file; the database must be closed first. @returns {string[]} what was removed */
  eraseAll() {
    const removed = [];
    for (const path of this.#paths) {
      try {
        rmSync(path, { force: false });
        removed.push(path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return removed;
  }
}

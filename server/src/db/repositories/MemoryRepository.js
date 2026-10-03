import { MemoryError } from '../../core/errors.js';

/**
 * What the assistant remembers between chats. Only the user's own words are ever stored
 * (invariant 7); the schema's CHECK constraint backs this up.
 */
export class MemoryRepository {
  #db;

  /** @param {import('../Database.js').Database} db */
  constructor(db) {
    this.#db = db;
  }

  /**
   * @param {{ content: string, source: 'user', createdAt?: Date }} entry
   * @returns {{ id: number }}
   * @throws {MemoryError} for any source other than `user`
   */
  add({ content, source, createdAt = new Date() }) {
    if (source !== 'user') throw new MemoryError('Memory can only be written from user input');
    const result = this.#db.run(
      'INSERT INTO memory (content, source, created_at) VALUES (?, ?, ?)',
      [content, source, createdAt.toISOString()],
    );
    return { id: Number(result.lastInsertRowid) };
  }

  /** @returns {{ id: number, content: string, createdAt: string }[]} oldest first */
  list() {
    return this.#db
      .all('SELECT id, content, created_at FROM memory ORDER BY id', [])
      .map((row) => ({ id: row.id, content: row.content, createdAt: row.created_at }));
  }

  /** @returns {boolean} */
  remove(id) {
    return Number(this.#db.run('DELETE FROM memory WHERE id = ?', [id]).changes) === 1;
  }
}

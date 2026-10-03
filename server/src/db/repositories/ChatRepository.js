/**
 * Local chat history (PRD F8.5). Messages are stored as JSON: a user message is the user's text;
 * an assistant message is what the chat showed (text, steps, cards, results).
 */
export class ChatRepository {
  #db;

  /** @param {import('../Database.js').Database} db */
  constructor(db) {
    this.#db = db;
  }

  /** @param {{ id: string, title: string | null, at: Date }} chat */
  create({ id, title, at }) {
    this.#db.run('INSERT INTO chats (id, title, created_at) VALUES (?, ?, ?)', [
      id,
      title,
      at.toISOString(),
    ]);
  }

  /** @returns {{ id: string, title: string | null, createdAt: string } | undefined} */
  get(id) {
    const row = this.#db.get('SELECT * FROM chats WHERE id = ?', [id]);
    return row && { id: row.id, title: row.title, createdAt: row.created_at };
  }

  /** @returns {{ id: string, title: string | null, createdAt: string }[]} newest first */
  list(limit = 50) {
    return this.#db
      .all('SELECT * FROM chats ORDER BY created_at DESC, rowid DESC LIMIT ?', [limit])
      .map((row) => ({ id: row.id, title: row.title, createdAt: row.created_at }));
  }

  /** @param {string} id @param {string} title */
  setTitle(id, title) {
    this.#db.run('UPDATE chats SET title = ? WHERE id = ?', [title, id]);
  }

  /** Removes the chat and, through the foreign key, its messages. @returns {boolean} */
  delete(id) {
    return Number(this.#db.run('DELETE FROM chats WHERE id = ?', [id]).changes) === 1;
  }

  /**
   * @param {{ chatId: string, role: 'user'|'assistant', content: unknown, at: Date }} message
   * @returns {{ id: number }}
   */
  addMessage({ chatId, role, content, at }) {
    const result = this.#db.run(
      'INSERT INTO chat_messages (chat_id, role, content_json, created_at) VALUES (?, ?, ?, ?)',
      [chatId, role, JSON.stringify(content), at.toISOString()],
    );
    return { id: Number(result.lastInsertRowid) };
  }

  /** @returns {{ id: number, role: string, content: unknown, createdAt: string }[]} oldest first */
  messages(chatId) {
    return this.#db
      .all('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY id', [chatId])
      .map((row) => ({
        id: row.id,
        role: row.role,
        content: JSON.parse(row.content_json),
        createdAt: row.created_at,
      }));
  }
}

import { beforeEach, describe, expect, it } from 'vitest';
import { Database } from '../../../src/db/Database.js';
import { Migrator } from '../../../src/db/Migrator.js';
import { ChatRepository } from '../../../src/db/repositories/ChatRepository.js';

let db;
let chats;

beforeEach(() => {
  db = new Database(':memory:');
  new Migrator(db).migrate();
  chats = new ChatRepository(db);
});

describe('ChatRepository', () => {
  it('stores chats newest first with their messages in order', () => {
    chats.create({ id: 'c1', title: null, at: new Date('2026-10-02T10:00:00Z') });
    chats.create({ id: 'c2', title: 'Later', at: new Date('2026-10-02T11:00:00Z') });
    chats.setTitle('c1', 'First');
    chats.addMessage({
      chatId: 'c1',
      role: 'user',
      content: { text: 'hi' },
      at: new Date('2026-10-02T10:00:01Z'),
    });
    const { id } = chats.addMessage({
      chatId: 'c1',
      role: 'assistant',
      content: { text: 'hello', steps: [] },
      at: new Date('2026-10-02T10:00:02Z'),
    });
    expect(id).toBe(2);
    expect(chats.list().map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(chats.get('c1')).toEqual({
      id: 'c1',
      title: 'First',
      createdAt: '2026-10-02T10:00:00.000Z',
    });
    expect(chats.messages('c1')).toEqual([
      { id: 1, role: 'user', content: { text: 'hi' }, createdAt: '2026-10-02T10:00:01.000Z' },
      {
        id: 2,
        role: 'assistant',
        content: { text: 'hello', steps: [] },
        createdAt: '2026-10-02T10:00:02.000Z',
      },
    ]);
    expect(() =>
      chats.addMessage({ chatId: 'c1', role: 'system', content: {}, at: new Date() }),
    ).toThrow();
  });

  it('deleting a chat removes its messages', () => {
    chats.create({ id: 'c1', title: null, at: new Date() });
    chats.addMessage({ chatId: 'c1', role: 'user', content: { text: 'hi' }, at: new Date() });
    expect(chats.delete('c1')).toBe(true);
    expect(chats.delete('c1')).toBe(false);
    expect(chats.get('c1')).toBeUndefined();
    expect(db.get('SELECT COUNT(*) AS n FROM chat_messages').n).toBe(0);
  });
});

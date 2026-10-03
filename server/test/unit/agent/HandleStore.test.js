import { describe, expect, it } from 'vitest';
import { HandleStore } from '../../../src/agent/HandleStore.js';
import { TaggedValue } from '../../../src/agent/TaggedValue.js';
import { HandleError } from '../../../src/core/errors.js';

const summary = TaggedValue.fromEmail('The sender asks to meet.', {
  id: '18f3',
  participants: ['rahul@acme.example'],
});

describe('HandleStore', () => {
  it('builds and parses email handles', () => {
    expect(HandleStore.emailHandle('18f3-a_b', 'body')).toBe('$email_18f3-a_b.body');
    expect(HandleStore.parse('$email_18f3.summary')).toEqual({
      kind: 'email',
      id: '18f3',
      field: 'summary',
    });
    expect(() => HandleStore.emailHandle('18f3', 'subject')).toThrow(HandleError);
    expect(() => HandleStore.emailHandle('bad id', 'body')).toThrow(HandleError);
  });

  it.each(['email_1.summary', '$email_1', '$email_1.from', '$step_0', '', null, 42])(
    'rejects malformed handle %s',
    (handle) => {
      expect(() => HandleStore.parse(handle)).toThrow(HandleError);
    },
  );

  it('registers and resolves tagged values', async () => {
    const store = new HandleStore();
    store.register('$email_18f3.summary', summary);
    expect(store.has('$email_18f3.summary')).toBe(true);
    expect(store.handles()).toEqual(['$email_18f3.summary']);
    expect(await store.resolve('$email_18f3.summary')).toBe(summary);
  });

  it('loads lazily registered content once', async () => {
    const store = new HandleStore();
    let loads = 0;
    store.register('$email_18f3.body', async () => {
      loads += 1;
      return summary.derive('full body');
    });
    const first = await store.resolve('$email_18f3.body');
    const second = await store.resolve('$email_18f3.body');
    expect(first.value).toBe('full body');
    expect(second).toBe(first);
    expect(loads).toBe(1);
  });

  it('fails closed on unknown handles, duplicates, bad sources and broken loaders', async () => {
    const store = new HandleStore();
    await expect(store.resolve('$email_404.summary')).rejects.toThrow(HandleError);
    store.register('$email_1.summary', summary);
    expect(() => store.register('$email_1.summary', summary)).toThrow(HandleError);
    expect(() => store.register('$email_2.summary', 'plain string')).toThrow(HandleError);
    expect(() => store.register('email_3.summary', summary)).toThrow(HandleError);

    store.register('$email_4.body', async () => {
      throw new Error('gmail down');
    });
    await expect(store.resolve('$email_4.body')).rejects.toThrow(HandleError);

    store.register('$email_5.body', async () => 'untagged text');
    await expect(store.resolve('$email_5.body')).rejects.toThrow(HandleError);
  });
});

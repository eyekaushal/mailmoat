import { describe, expect, it } from 'vitest';
import { TaggedValue } from '../../../src/agent/TaggedValue.js';

const email42 = { id: '42', participants: ['Rahul@acme.example', 'me@example.com'] };

describe('TaggedValue', () => {
  it('tags user input as public and user-sourced', () => {
    const value = TaggedValue.fromUser('hello');
    expect(value.value).toBe('hello');
    expect(value.sources).toEqual([{ type: 'user' }]);
    expect(value.readers).toBe('public');
    expect(value.onlySources('user')).toBe(true);
    expect(value.isReadableBy('anyone@example.com')).toBe(true);
  });

  it('tags email content to that email and its participants (lower-cased)', () => {
    const value = TaggedValue.fromEmail('summary', email42);
    expect(value.sources).toEqual([{ type: 'email', id: '42' }]);
    expect(value.emailIds()).toEqual(['42']);
    expect(value.isReadableBy('RAHUL@acme.example')).toBe(true);
    expect(value.isReadableBy('eve@evil.example')).toBe(false);
    expect(value.onlySources('user')).toBe(false);
    expect(value.hasSource('email')).toBe(true);
  });

  it('tags own data as user-only', () => {
    const value = TaggedValue.fromOwnData(['a@b.c'], 'contacts');
    expect(value.readers).toBe('user-only');
    expect(value.isReadableBy('a@b.c')).toBe(false);
  });

  it('combines by unioning sources and intersecting readers', () => {
    const typed = TaggedValue.fromUser('Hi,');
    const fromMail = TaggedValue.fromEmail('Friday 5pm', email42);
    const other = TaggedValue.fromEmail('x', { id: '43', participants: ['me@example.com'] });

    const both = TaggedValue.combine('Hi, Friday 5pm', [typed, fromMail]);
    expect(both.sources).toEqual([{ type: 'user' }, { type: 'email', id: '42' }]);
    expect([...both.readers]).toEqual(['rahul@acme.example', 'me@example.com']);

    const three = TaggedValue.combine('y', [both, other, typed]);
    expect(three.emailIds()).toEqual(['42', '43']);
    expect([...three.readers]).toEqual(['me@example.com']);

    const withPrivate = TaggedValue.combine('z', [three, TaggedValue.fromOwnData(1, 'calendar')]);
    expect(withPrivate.readers).toBe('user-only');
    expect(withPrivate.isReadableBy('me@example.com')).toBe(false);
  });

  it('treats an empty intersection as user-only', () => {
    const a = TaggedValue.fromEmail('a', { id: '1', participants: ['x@a.example'] });
    const b = TaggedValue.fromEmail('b', { id: '2', participants: ['y@b.example'] });
    expect(TaggedValue.combine('ab', [a, b]).readers).toBe('user-only');
    expect(TaggedValue.fromEmail('c', { id: '3', participants: [] }).readers).toBe('user-only');
  });

  it('keeps provenance through derive and is immutable', () => {
    const value = TaggedValue.fromEmail('2026-10-09T17:00', email42);
    const derived = value.derive(new Date('2026-10-09T17:00Z'));
    expect(derived.sources).toEqual(value.sources);
    expect(derived.readers).toEqual(value.readers);
    expect(Object.isFrozen(value)).toBe(true);
    expect(() => {
      value.value = 'changed';
    }).toThrow();
    expect(() => value.sources.push({ type: 'user' })).toThrow();
  });

  it('rejects values without a source or with a bad readers mode', () => {
    expect(() => new TaggedValue('x', [], 'public')).toThrow(TypeError);
    expect(() => new TaggedValue('x', [{ type: 'user' }], 'everyone')).toThrow(TypeError);
    expect(() => new TaggedValue('x', [{ type: 'email' }], 'public')).toThrow(TypeError);
    expect(() => TaggedValue.combine('x', [])).toThrow(TypeError);
  });

  it('serialises for the audit log', () => {
    expect(JSON.parse(JSON.stringify(TaggedValue.fromEmail('s', email42)))).toEqual({
      value: 's',
      sources: [{ type: 'email', id: '42' }],
      readers: ['me@example.com', 'rahul@acme.example'],
    });
    expect(TaggedValue.fromUser('u').toJSON().readers).toBe('public');
  });
});

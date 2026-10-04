import { describe, expect, it } from 'vitest';
import { applyEvent, emptyTurn, sourcesOf } from '../../src/lib/chatTurn.js';

const card = {
  approvalId: 'ap1',
  kind: 'event',
  tool: 'create_calendar_event',
  fields: {
    title: { value: 'Launch', sources: [{ type: 'user' }] },
    start: {
      value: '2026-10-10T15:00:00+05:30',
      sources: [{ type: 'email', id: 'g1', from: 'bookings@indigo.example', date: '2026-10-01' }],
    },
  },
};

describe('applyEvent', () => {
  it('folds streamed events into the live turn', () => {
    let turn = emptyTurn();
    turn = applyEvent(turn, { type: 'status', text: 'Planning…' });
    expect(turn.statusText).toBe('Planning…');
    turn = applyEvent(turn, {
      type: 'step',
      step: 1,
      tool: 'search_emails',
      label: 'Searching…',
      status: 'running',
    });
    turn = applyEvent(turn, {
      type: 'step',
      step: 1,
      tool: 'search_emails',
      label: 'Searching…',
      status: 'done',
    });
    turn = applyEvent(turn, {
      type: 'result',
      step: 1,
      tool: 'search_emails',
      value: [],
      untrusted: true,
      sources: [],
    });
    turn = applyEvent(turn, { type: 'card', card });
    turn = applyEvent(turn, { type: 'message', text: 'Here is a proposal.' });
    turn = applyEvent(turn, { type: 'unknown' });
    expect(turn.steps).toEqual([
      { type: 'step', step: 1, tool: 'search_emails', label: 'Searching…', status: 'done' },
    ]);
    expect(turn.results).toHaveLength(1);
    expect(turn.cards).toEqual([card]);
    expect(turn.text).toBe('Here is a proposal.');
    expect(turn.statusText).toBe('');
  });
});

describe('sourcesOf', () => {
  it('numbers every email source once, results first, then card fields', () => {
    const turn = {
      results: [
        {
          sources: [
            { type: 'email', id: 'g2', from: 'rahul@acme-corp.com', date: '2026-10-02T09:00:00Z' },
            { type: 'user' },
            { type: 'email', id: 'g2' },
          ],
        },
      ],
      cards: [card],
    };
    expect(sourcesOf(turn)).toEqual([
      { id: 'g2', from: 'rahul@acme-corp.com', date: '2026-10-02T09:00:00Z' },
      { id: 'g1', from: 'bookings@indigo.example', date: '2026-10-01' },
    ]);
    expect(sourcesOf({})).toEqual([]);
  });
});

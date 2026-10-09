import { describe, expect, it } from 'vitest';
import { AnswerComposer } from '../../../src/features/AnswerComposer.js';

const composer = new AnswerComposer({ timeZone: 'Asia/Kolkata' });
const done = (tool) => ({ tool, status: 'done' });

describe('AnswerComposer.compose (PLAN §15.1 decision 4)', () => {
  it('counts an email list, names the sender, and says when a name is ambiguous', () => {
    const emails = (count, senders) => [
      { tool: 'search_emails', kind: 'emails', value: { count, ids: [], senders } },
    ];
    expect(
      composer.compose({
        status: 'completed',
        planMessage: 'Searching…',
        steps: [done('search_emails')],
        results: emails(3, ['a@x']),
        cards: [],
        query: { needsReply: true },
      }),
    ).toBe('3 emails need a reply.');
    expect(
      composer.compose({
        status: 'completed',
        planMessage: '',
        steps: [done('search_emails')],
        results: emails(1, ['a@x']),
        cards: [],
        query: { needsReply: true },
      }),
    ).toBe('1 email needs a reply.');
    expect(
      composer.compose({
        status: 'completed',
        planMessage: '',
        steps: [done('search_emails')],
        results: emails(0, []),
        cards: [],
        query: { needsReply: true },
      }),
    ).toBe('Nothing needs a reply right now.');
    expect(
      composer.compose({
        status: 'completed',
        planMessage: '',
        steps: [done('search_emails')],
        results: emails(0, []),
        cards: [],
        query: { sender: 'Neha' },
      }),
    ).toBe('Nothing from Neha in the last 15 days.');
    expect(
      composer.compose({
        status: 'completed',
        planMessage: '',
        steps: [done('search_emails')],
        results: emails(2, ['neha@partnerco.io']),
        cards: [],
        query: { sender: 'Neha' },
      }),
    ).toBe('2 emails from Neha.');
    expect(
      composer.compose({
        status: 'completed',
        planMessage: '',
        steps: [done('search_emails')],
        results: emails(2, ['neha@partnerco.io', 'neha.k@gmail.com']),
        cards: [],
        query: { sender: 'Neha' },
      }),
    ).toBe('2 emails from Neha. 2 senders match “Neha”; check the addresses.');
    // An address is one person: no ambiguity note even with several results.
    expect(
      composer.compose({
        status: 'completed',
        planMessage: '',
        steps: [done('search_emails')],
        results: emails(2, ['a@x', 'b@x']),
        cards: [],
        query: { sender: 'a@x' },
      }),
    ).toBe('2 emails from a@x.');
  });

  it('introduces summaries and cards, and reports denials and unsupported requests', () => {
    expect(
      composer.compose({
        status: 'completed',
        planMessage: '',
        steps: [done('summarise')],
        results: [{ tool: 'summarise', kind: 'summary', value: { summary: 'x' } }],
        cards: [],
        query: { sender: 'Neha' },
      }),
    ).toBe('Here is what Neha wrote.');
    expect(
      composer.compose({
        status: 'pending',
        planMessage: '',
        steps: [done('get_free_busy'), { tool: 'create_calendar_event', status: 'pending' }],
        results: [],
        cards: [{ kind: 'event', tool: 'create_calendar_event' }],
      }),
    ).toBe('Here is the event. Save it when it looks right.');
    expect(
      composer.compose({
        status: 'pending',
        planMessage: '',
        steps: [{ tool: 'reply', status: 'pending' }],
        results: [],
        cards: [{ kind: 'reply', tool: 'reply' }],
      }),
    ).toBe('Draft ready. Read it before you save it.');
    expect(
      composer.compose({
        status: 'pending',
        planMessage: '',
        steps: [{ tool: 'send_email', status: 'pending' }],
        results: [],
        cards: [{ kind: 'email', tool: 'send_email' }],
      }),
    ).toBe('Ready to send. Approve it on the Approvals page.');
    expect(
      composer.compose({
        status: 'stopped',
        planMessage: '',
        steps: [
          { tool: 'send_email', status: 'denied', reason: 'Recipients did not come from you' },
        ],
        results: [],
        cards: [],
      }),
    ).toBe('Not done: Recipients did not come from you');
    expect(
      composer.compose({
        status: 'completed',
        planMessage: 'That is not supported yet.',
        steps: [],
        results: [],
        cards: [],
      }),
    ).toBe('That is not supported yet.');
    expect(
      composer.compose({
        status: 'failed',
        planMessage: 'I could not plan that: x.',
        steps: [],
        results: [],
        cards: [],
      }),
    ).toBe('I could not plan that: x.');
    expect(
      composer.compose({
        status: 'completed',
        planMessage: '',
        steps: [done('archive')],
        results: [],
        cards: [],
      }),
    ).toBe('Done.');
  });

  it('writes the done line under a card from the approval’s typed arguments', () => {
    const event = {
      tool: 'create_calendar_event',
      args: {
        start: { value: '2026-10-09T17:00:00+05:30' },
        end: { value: '2026-10-09T18:00:00+05:30' },
      },
    };
    expect(composer.decided(event, 'performed')).toBe(
      'Done! Your meeting is scheduled for Fri 9 Oct, 17:00 to 18:00.',
    );
    expect(composer.decided({ tool: 'send_email', args: {} }, 'performed')).toBe(
      'Done! Your email is on its way.',
    );
    expect(composer.decided({ tool: 'reply', args: {} }, 'performed')).toBe(
      'Saved to Gmail Drafts. Nothing is sent until you approve it.',
    );
    expect(composer.decided(event, 'denied', 'Policy said no')).toBe('Not done: Policy said no');
    expect(composer.decided(event, 'rejected')).toBe('Discarded.');
  });
});

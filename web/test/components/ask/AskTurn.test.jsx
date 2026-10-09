import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AskTurn, describeSource } from '../../../src/components/ask/AskTurn.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const mount = (message, props = {}) =>
  render(
    <MemoryRouter>
      <AskTurn message={message} {...props} />
    </MemoryRouter>,
  );

const turn = (content) => ({ role: 'assistant', content: { steps: [], cards: [], ...content } });

describe('AskTurn (PLAN §15)', () => {
  it('shows your words in a light tint on the right, never an accent bubble', () => {
    mount({ role: 'user', content: { text: 'What needs a reply?' } });
    const block = screen.getByText('What needs a reply?');
    expect(block.className).toContain('bg-accent-soft');
    expect(block.parentElement.className).toContain('justify-end');
  });

  it('renders an email list from the inbox API, each row opening the email, then the answer line', async () => {
    const server = fakeServer({
      'GET /emails': (_body, path) => {
        expect(path).toBe('/emails?ids=g1,g2');
        return {
          items: [
            {
              gmailId: 'g1',
              fromName: 'Rahul Mehta',
              fromAddr: 'rahul@acme-corp.com',
              subject: 'Deck <img src=x>',
              snippet: 'Please review',
              date: '2026-10-02T09:00:00Z',
              verdict: null,
              avatar: { initials: 'RM', hue: 20 },
            },
            {
              gmailId: 'g2',
              fromName: null,
              fromAddr: 'priya@partnerco.io',
              subject: '',
              snippet: '',
              date: '2026-10-01T09:00:00Z',
              verdict: { level: 'SUSPICIOUS' },
              avatar: { initials: 'P', hue: 200 },
            },
          ],
          nextCursor: null,
        };
      },
    });
    renderPage(
      <AskTurn
        message={turn({
          text: '2 emails need a reply.',
          progress: 'Searching your inbox…',
          status: 'completed',
          results: [
            {
              step: 0,
              tool: 'search_emails',
              kind: 'emails',
              value: { count: 2, ids: ['g1', 'g2'], senders: [] },
              untrusted: true,
              sources: [{ type: 'inbox' }],
            },
          ],
        })}
      />,
      { server },
    );
    const list = await screen.findByRole('list', { name: 'Emails' });
    const rows = list.querySelectorAll('button');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Rahul Mehta');
    expect(rows[0].textContent).toContain('Deck <img src=x>');
    expect(rows[1].textContent).toContain('priya@partnerco.io');
    expect(rows[1].textContent).toContain('(no subject)');
    expect(document.querySelector('img')).toBeNull();
    // Only the answer line: no progress line, no steps, no raw data.
    expect(screen.getByText('2 emails need a reply.').className).toContain('text-accent');
    expect(screen.queryByText('Searching your inbox…')).toBeNull();
    expect(document.body.textContent).not.toContain('{');
  });

  it('renders a summary as plain text, marked as the AI’s unverified reading of that email', () => {
    mount(
      turn({
        text: 'Here is what Rahul wrote.',
        status: 'completed',
        results: [
          {
            step: 0,
            tool: 'summarise',
            kind: 'summary',
            value: { summary: 'Rahul asks for the deck <b>today</b>.' },
            untrusted: true,
            sources: [
              {
                type: 'email',
                id: 'g1',
                from: 'rahul@acme-corp.com',
                date: '2026-10-02T09:00:00Z',
              },
            ],
          },
        ],
      }),
    );
    expect(screen.getByText('Rahul asks for the deck <b>today</b>.')).toBeTruthy();
    expect(document.querySelector('b')).toBeNull();
    expect(
      screen.getByText('AI summary of an email from rahul@acme-corp.com on 2026-10-02, unverified'),
    ).toBeTruthy();
    expect(screen.getByText('Here is what Rahul wrote.')).toBeTruthy();
  });

  it('shows the progress line while live, and the answer only once stored', () => {
    const content = {
      text: '',
      progress: 'Finding the best time for everyone…',
      status: 'completed',
      results: [],
    };
    const { unmount } = mount(turn(content), { live: true });
    expect(screen.getByRole('status').textContent).toBe('Finding the best time for everyone…');
    unmount();
    mount(turn({ ...content, text: 'Here is the event. Save it when it looks right.' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('Here is the event. Save it when it looks right.')).toBeTruthy();
  });

  it('marks a failed turn and a recorded decision', () => {
    mount(turn({ text: 'I could not plan that.', status: 'failed', results: [] }));
    expect(screen.getByText('I could not plan that.').className).toContain('text-danger');
    mount(turn({ text: 'Not done: refused by policy.', status: 'denied', approvalId: 'ap1' }));
    expect(screen.getByText('Not done: refused by policy.').className).toContain('text-danger');
    mount(
      turn({ text: 'Done! Your email is on its way.', status: 'performed', approvalId: 'ap2' }),
    );
    expect(screen.getByText('Done! Your email is on its way.').className).toContain('text-accent');
  });

  it('describes a source in plain words', () => {
    expect(describeSource({ id: 'g1' })).toBe('an email');
    expect(describeSource({ from: 'a@x.example', date: '2026-10-01T00:00:00Z' })).toBe(
      'email from a@x.example on 2026-10-01',
    );
  });
});

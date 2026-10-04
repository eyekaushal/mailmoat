import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AskTurn, describeSource } from '../../../src/components/ask/AskTurn.jsx';

const mount = (message, props = {}) =>
  render(
    <MemoryRouter>
      <AskTurn message={message} {...props} />
    </MemoryRouter>,
  );

describe('AskTurn', () => {
  it('shows your words as a quiet block, never an accent bubble', () => {
    mount({ role: 'user', content: { text: 'What needs a reply?' } });
    const block = screen.getByText('What needs a reply?');
    expect(block.className).toContain('bg-surface-3');
    expect(block.className).not.toContain('bg-accent');
  });

  it('renders the answer as plain text with numbered sources linking to the emails', () => {
    mount({
      role: 'assistant',
      content: {
        text: 'Two emails need a reply <b>today</b>.',
        status: 'done',
        steps: [{ step: 1, tool: 'search_emails', label: 'Searching inbox…', status: 'done' }],
        results: [
          {
            step: 1,
            tool: 'search_emails',
            value: [{ from: { address: 'rahul@acme-corp.com' }, summary: 'Deck <img src=x>' }],
            untrusted: true,
            sources: [
              {
                type: 'email',
                id: 'g1',
                from: 'rahul@acme-corp.com',
                date: '2026-10-02T09:00:00Z',
              },
              { type: 'email', from: 'priya@partnerco.io' },
            ],
          },
        ],
        cards: [],
      },
    });
    expect(screen.getByText('Two emails need a reply <b>today</b>.')).toBeTruthy();
    expect(document.querySelector('b, img')).toBeNull();
    expect(screen.getByText(/from untrusted email content/)).toBeTruthy();
    expect(screen.getByText('search emails')).toBeTruthy();
    const sources = screen.getByRole('list', { name: 'Sources' });
    expect(sources.textContent).toContain('1.email from rahul@acme-corp.com on 2026-10-02');
    expect(sources.textContent).toContain('2.email from priya@partnerco.io');
    expect(screen.getByRole('link', { name: /rahul@acme-corp.com/ }).getAttribute('href')).toBe(
      '/inbox/g1',
    );
    expect(screen.queryByRole('link', { name: /priya/ })).toBeNull();
  });

  it('marks a failed turn and a recorded decision', () => {
    mount({
      role: 'assistant',
      content: {
        text: 'I could not plan that.',
        status: 'failed',
        steps: [],
        results: [],
        cards: [],
      },
    });
    expect(screen.getByText('Nothing was run.')).toBeTruthy();
    mount({
      role: 'assistant',
      content: {
        text: 'Refused by policy.',
        status: 'denied',
        approvalId: 'ap1',
        steps: [],
        cards: [],
      },
    });
    expect(screen.getByText('Refused by policy.').className).toContain('text-danger');
  });

  it('describes a source in plain words', () => {
    expect(describeSource({ id: 'g1' })).toBe('an email');
    expect(describeSource({ from: 'a@x.example', date: '2026-10-01T00:00:00Z' })).toBe(
      'email from a@x.example on 2026-10-01',
    );
  });
});

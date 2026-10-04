import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ThreadMessage, previewOf } from '../../../src/pages/inbox/ThreadMessage.jsx';
import { TooltipProvider } from '../../../src/ui/Tooltip.jsx';

const now = new Date(2026, 9, 5, 12, 0, 0);

const message = (extra = {}) => ({
  gmailId: 'm1',
  direction: 'inbound',
  date: new Date(2026, 9, 5, 9, 12).toISOString(),
  isRead: true,
  verdict: { level: 'SAFE', score: 0, injectionAttempt: false, userFeedback: null },
  unreadable: false,
  subject: 'Launch deck',
  from: { name: 'Rahul Mehta', address: 'rahul@acme-corp.com' },
  to: [],
  cc: [],
  text: 'Hi Kaushal,\n\nthe deck is here. <b>Not HTML</b>',
  textTruncated: false,
  links: [{ href: 'https://acme-corp.com/deck', text: 'here', host: 'acme-corp.com' }],
  attachments: [{ filename: 'deck.pdf', mimeType: 'application/pdf' }],
  avatar: { initials: 'RM', hue: 20 },
  ...extra,
});

function show(element) {
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <ol>{element}</ol>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

describe('ThreadMessage', () => {
  it('collapsed: sender, one-line preview and date on one row that expands on click', () => {
    const onToggle = vi.fn();
    show(<ThreadMessage message={message()} expanded={false} onToggle={onToggle} now={now} />);
    const row = screen.getByRole('button', { expanded: false });
    expect(row.textContent).toContain('Rahul Mehta');
    expect(row.textContent).toContain('Hi Kaushal, the deck is here. <b>Not HTML</b>');
    expect(row.textContent).toContain('9:12');
    expect(screen.queryByText('Links')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
    fireEvent.click(row);
    expect(onToggle).toHaveBeenCalled();
  });

  it('expanded: avatar, name, address, date, plain text, disarmed links and attachment names', () => {
    show(<ThreadMessage message={message()} expanded onToggle={() => {}} now={now} />);
    expect(screen.getByRole('button', { expanded: true }).textContent).toContain('Rahul Mehta');
    expect(screen.getByText('rahul@acme-corp.com')).toBeTruthy();
    expect(screen.getByText(/Thu|Mon/).textContent).toContain('9:12');
    expect(screen.getByText('RM')).toBeTruthy();
    expect(document.querySelector('pre').textContent).toBe(
      'Hi Kaushal,\n\nthe deck is here. <b>Not HTML</b>',
    );
    expect(document.querySelector('b')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('link', { name: /acme-corp\.com/ }).getAttribute('href')).toBe(
      'https://acme-corp.com/deck',
    );
    expect(screen.getByText('here')).toBeTruthy();
    expect(screen.getByText('deck.pdf')).toBeTruthy();
    expect(screen.getByText(/never opened or downloaded/)).toBeTruthy();
  });

  it('never makes a link clickable on a message that is not SAFE', () => {
    show(
      <ThreadMessage
        message={message({ verdict: { level: 'SUSPICIOUS', score: 40 } })}
        expanded
        onToggle={() => {}}
        now={now}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('acme-corp.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open anyway' })).toBeTruthy();
  });

  it('labels the AI summary and shows it only when given', () => {
    const { rerender } = show(
      <ThreadMessage
        message={message()}
        expanded
        onToggle={() => {}}
        opened
        summary="Wants the deck <img src=x>"
        now={now}
      />,
    );
    expect(screen.getByText('AI summary')).toBeTruthy();
    expect(screen.getByText('Wants the deck <img src=x>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    rerender(
      <TooltipProvider>
        <MemoryRouter>
          <ol>
            <ThreadMessage message={message()} expanded onToggle={() => {}} now={now} />
          </ol>
        </MemoryRouter>
      </TooltipProvider>,
    );
    expect(screen.queryByText('AI summary')).toBeNull();
  });

  it('marks risk with a dot when collapsed and the word when expanded, except on the opened email', () => {
    const dangerous = message({ verdict: { level: 'DANGEROUS', score: 90 } });
    const { rerender } = show(
      <ThreadMessage message={dangerous} expanded={false} onToggle={() => {}} now={now} />,
    );
    expect(screen.getByRole('img', { name: 'Dangerous' })).toBeTruthy();
    rerender(
      <TooltipProvider>
        <MemoryRouter>
          <ol>
            <ThreadMessage message={dangerous} expanded onToggle={() => {}} now={now} />
          </ol>
        </MemoryRouter>
      </TooltipProvider>,
    );
    expect(screen.getByText('Dangerous')).toBeTruthy();
    rerender(
      <TooltipProvider>
        <MemoryRouter>
          <ol>
            <ThreadMessage message={dangerous} expanded opened onToggle={() => {}} now={now} />
          </ol>
        </MemoryRouter>
      </TooltipProvider>,
    );
    expect(screen.queryByText('Dangerous')).toBeNull();
  });

  it('shows the user’s own replies without a risk mark and unreadable messages as such', () => {
    show(
      <ThreadMessage
        message={message({
          gmailId: 'sent',
          direction: 'outbound',
          verdict: null,
          from: { name: null, address: 'kaushal@gmail.com' },
        })}
        expanded={false}
        onToggle={() => {}}
        now={now}
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('kaushal@gmail.com')).toBeTruthy();
    expect(previewOf({ unreadable: true })).toBe('This message could not be read');
    expect(previewOf({ text: '' })).toBe('(no visible text)');
    expect(previewOf({ text: `${'a'.repeat(200)} b` })).toHaveLength(160);
    show(
      <ThreadMessage
        message={{
          gmailId: 'broken',
          direction: 'inbound',
          date: now.toISOString(),
          verdict: null,
          unreadable: true,
        }}
        expanded
        onToggle={() => {}}
        now={now}
      />,
    );
    expect(screen.getByText(/could not be read, so nothing/)).toBeTruthy();
    expect(screen.getByText('Not checked')).toBeTruthy();
  });
});

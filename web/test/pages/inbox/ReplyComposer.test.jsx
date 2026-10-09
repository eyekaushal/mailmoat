import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReplyComposer } from '../../../src/pages/inbox/ReplyComposer.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

function mount(server, props = {}) {
  const onDone = vi.fn();
  const onOpenChange = vi.fn();
  renderPage(
    <ReplyComposer
      open
      onOpenChange={onOpenChange}
      gmailId="a"
      level="SAFE"
      onDone={onDone}
      {...props}
    />,
    { server },
  );
  return { onDone, onOpenChange, dialog: () => screen.getByRole('dialog') };
}

describe('ReplyComposer', () => {
  it('offers "Write it myself" and "Draft with AI", and sends a typed reply for approval only', async () => {
    const server = fakeServer({
      'POST /emails/a/reply-request': { approvalId: 'ap-1', decision: 'ASK' },
    });
    const { onDone, onOpenChange, dialog } = mount(server);
    expect(dialog().textContent).toContain('Reply');
    fireEvent.click(screen.getByRole('button', { name: 'Write it myself' }));
    const editor = screen.getByLabelText('Reply text');
    expect(screen.getByRole('button', { name: 'Send for approval' }).disabled).toBe(true);
    fireEvent.change(editor, { target: { value: 'Dear Rahul, yes.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(server.calls.find((c) => c.path === '/emails/a/reply-request').body).toEqual({
      body: 'Dear Rahul, yes.',
      origin: 'user',
      draftId: null,
    });
    expect(onDone.mock.calls[0][0].text).toMatch(/Approvals/);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(server.calls.some((c) => c.path.includes('send'))).toBe(false);
  });

  it('drafts with AI into the editor without saving, then saves to Gmail Drafts as an AI draft', async () => {
    const server = fakeServer({
      'POST /emails/a/compose': {
        gmailId: 'a',
        text: 'Dear Rahul,\n\nYes.\n\nBest regards,\nKaushal',
      },
      'POST /emails/a/save-reply': { gmailId: 'a', draftId: 'd1' },
    });
    const { onDone } = mount(server);
    fireEvent.click(screen.getByRole('button', { name: 'Draft with AI' }));
    fireEvent.change(screen.getByLabelText(/What should it say/), { target: { value: 'say yes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    const editor = await screen.findByLabelText('Reply text');
    expect(editor.value).toContain('Yes.');
    expect(server.calls.find((c) => c.path === '/emails/a/compose').body).toEqual({
      instructions: 'say yes',
      allowSuspicious: false,
    });
    expect(screen.getByText(/can only be sent back to this conversation/)).toBeTruthy();
    fireEvent.change(editor, { target: { value: 'Dear Rahul, yes, Friday.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save to Drafts' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(server.calls.find((c) => c.path === '/emails/a/save-reply').body).toEqual({
      body: 'Dear Rahul, yes, Friday.',
      origin: 'ai',
      draftId: null,
    });
    expect(server.calls.filter((c) => c.method === 'POST')).toHaveLength(2);
  });

  it('asks "Draft anyway" on a suspicious email and shows a refusal in place', async () => {
    const server = fakeServer({
      'POST /emails/a/compose': () =>
        new Response(JSON.stringify({ error: 'The Drafter refused' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    });
    mount(server, { level: 'SUSPICIOUS' });
    fireEvent.click(screen.getByRole('button', { name: 'Draft with AI' }));
    expect(screen.getByText(/flagged as suspicious/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Draft anyway' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('refused'));
    expect(server.calls.find((c) => c.path === '/emails/a/compose').body.allowSuspicious).toBe(
      true,
    );
  });

  it('continues a Gmail draft with its text and id', async () => {
    const server = fakeServer({ 'POST /emails/a/reply-request': { approvalId: 'ap-2' } });
    mount(server, { initial: { text: 'Dear Rahul, I will review it.', draftId: 'r-77' } });
    const editor = screen.getByLabelText('Reply text');
    expect(editor.value).toBe('Dear Rahul, I will review it.');
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Send for approval' }),
    );
    await waitFor(() =>
      expect(server.calls.find((c) => c.path === '/emails/a/reply-request').body).toEqual({
        body: 'Dear Rahul, I will review it.',
        origin: 'ai',
        draftId: 'r-77',
      }),
    );
  });
});

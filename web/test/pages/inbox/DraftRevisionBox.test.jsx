import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DraftRevisionBox, SKILLS } from '../../../src/pages/inbox/DraftRevisionBox.jsx';
import { fakeServer, json, renderPage } from '../../helpers.jsx';

const DRAFT = {
  draftId: 'r-77',
  text: 'Dear Rahul,\n\nI will review it.\n\nBest regards,\nKaushal',
};

function mount(server, props = {}) {
  const onRevised = vi.fn();
  renderPage(
    <DraftRevisionBox gmailId="a" draft={DRAFT} level="SAFE" onRevised={onRevised} {...props} />,
    { server },
  );
  return { onRevised, input: () => screen.getByLabelText('Change this draft') };
}

const revised = { gmailId: 'a', draftId: 'r-78', text: 'Hi Rahul, will do.' };

describe('DraftRevisionBox (PLAN §16)', () => {
  it('opens the skills menu on "/", filters as you type, and picks with the keyboard', () => {
    const { input } = mount(fakeServer({}));
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.change(input(), { target: { value: '/' } });
    const menu = screen.getByRole('listbox', { name: 'Skills' });
    expect(within(menu).getAllByRole('option')).toHaveLength(SKILLS.length);
    expect(within(menu).getByText('/humanize')).toBeTruthy();
    expect(within(menu).getByText('Sound like you wrote it')).toBeTruthy();
    fireEvent.change(input(), { target: { value: '/sh' } });
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
    fireEvent.change(input(), { target: { value: '/' } });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('/humanize')).toBeTruthy();
    expect(input().value).toBe('');
    // Backspace on an empty line removes the chip again.
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(screen.queryByText('/humanize')).toBeNull();
  });

  it('posts the draft as shown with the skill and the words, then reports the new draft', async () => {
    const server = fakeServer({ 'POST /emails/a/revise': revised });
    const { input, onRevised } = mount(server);
    fireEvent.change(input(), { target: { value: '/' } });
    fireEvent.mouseDown(screen.getByText('/shorter'));
    fireEvent.change(input(), { target: { value: 'keep the Friday bit' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(onRevised).toHaveBeenCalledWith(revised));
    expect(server.calls.find((c) => c.path === '/emails/a/revise').body).toEqual({
      draftId: 'r-77',
      text: DRAFT.text,
      skill: 'shorter',
      instruction: 'keep the Friday bit',
      tone: null,
      allowSuspicious: false,
    });
    expect(server.calls.some((c) => c.path.includes('send') || c.path.includes('reply'))).toBe(
      false,
    );
  });

  it('treats plain words as /rewrite and needs words for it', async () => {
    const server = fakeServer({ 'POST /emails/a/revise': revised });
    const { input } = mount(server);
    const send = () => screen.getByRole('button', { name: 'Revise' });
    expect(send().disabled).toBe(true);
    fireEvent.change(input(), { target: { value: 'say I will send it Monday' } });
    expect(send().disabled).toBe(false);
    fireEvent.click(send());
    await waitFor(() => expect(server.calls.some((c) => c.path === '/emails/a/revise')).toBe(true));
    expect(server.calls.at(-1).body).toMatchObject({
      skill: 'rewrite',
      instruction: 'say I will send it Monday',
    });
  });

  it('/tone asks for one of three tones before it can run', async () => {
    const server = fakeServer({ 'POST /emails/a/revise': revised });
    const { input } = mount(server);
    fireEvent.change(input(), { target: { value: '/tone' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    const tones = screen.getByRole('listbox', { name: 'Tones' });
    expect(
      within(tones)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['formal', 'semi-formal', 'casual']);
    expect(screen.getByRole('button', { name: 'Revise' }).disabled).toBe(true);
    fireEvent.mouseDown(within(tones).getByText('casual'));
    expect(screen.getByText('/tone casual')).toBeTruthy();
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(server.calls.some((c) => c.path === '/emails/a/revise')).toBe(true));
    expect(server.calls.at(-1).body).toMatchObject({
      skill: 'tone',
      tone: 'casual',
      instruction: null,
    });
  });

  it('shows a failure in quiet words under the line and keeps the input', async () => {
    const server = fakeServer({
      'POST /emails/a/revise': json(
        { error: 'A SUSPICIOUS email is only drafted when you ask for it' },
        403,
      ),
    });
    const { input, onRevised } = mount(server);
    fireEvent.change(input(), { target: { value: 'make it warmer' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('only drafted when you ask');
    expect(alert.className).not.toContain('danger');
    expect(onRevised).not.toHaveBeenCalled();
    expect(input().value).toBe('make it warmer');
  });

  it('asks once before revising a draft to a SUSPICIOUS email', async () => {
    const server = fakeServer({ 'POST /emails/a/revise': revised });
    const { input } = mount(server, { level: 'SUSPICIOUS' });
    fireEvent.change(input(), { target: { value: '/proofread' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    const dialog = await screen.findByRole('dialog');
    expect(server.calls.some((c) => c.method === 'POST')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revise anyway' }));
    await waitFor(() => expect(server.calls.some((c) => c.path === '/emails/a/revise')).toBe(true));
    expect(server.calls.at(-1).body).toMatchObject({ skill: 'proofread', allowSuspicious: true });
  });
});

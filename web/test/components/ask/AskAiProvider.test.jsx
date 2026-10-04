import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AskAiProvider, useAskAi } from '../../../src/components/ask/AskAiProvider.jsx';

function Probe() {
  const ask = useAskAi();
  return (
    <div>
      <output>{`${ask.isOpen}:${ask.emailId ?? '-'}`}</output>
      <button onClick={() => ask.show({ emailId: 'g1' })}>show</button>
      <button onClick={ask.toggle}>toggle</button>
      <button onClick={ask.hide}>hide</button>
      <button onClick={ask.forgetEmail}>forget</button>
    </div>
  );
}

describe('AskAiProvider', () => {
  beforeEach(() => window.localStorage.clear());

  it('opens with an email, forgets it, toggles and remembers the open state', () => {
    render(
      <AskAiProvider>
        <Probe />
      </AskAiProvider>,
    );
    const state = () => screen.getByRole('status').textContent;
    expect(state()).toBe('false:-');
    fireEvent.click(screen.getByText('show'));
    expect(state()).toBe('true:g1');
    expect(window.localStorage.getItem('mailmoat.askAi')).toBe('open');
    fireEvent.click(screen.getByText('forget'));
    expect(state()).toBe('true:-');
    fireEvent.click(screen.getByText('toggle'));
    expect(state()).toBe('false:-');
    expect(window.localStorage.getItem('mailmoat.askAi')).toBeNull();
    fireEvent.click(screen.getByText('toggle'));
    fireEvent.click(screen.getByText('hide'));
    expect(state()).toBe('false:-');
  });

  it('starts open when it was left open', () => {
    window.localStorage.setItem('mailmoat.askAi', 'open');
    render(
      <AskAiProvider>
        <Probe />
      </AskAiProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('true:-');
  });

  it('is a no-op outside the provider, so screens render without the shell', () => {
    render(<Probe />);
    fireEvent.click(screen.getByText('show'));
    expect(screen.getByRole('status').textContent).toBe('false:-');
  });
});

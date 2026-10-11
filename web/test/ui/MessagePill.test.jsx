import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessagePill } from '../../src/ui/MessagePill.jsx';

describe('MessagePill', () => {
  it('is one full-radius pill with the control between its leading and trailing slots', () => {
    render(
      <MessagePill
        leading={<button type="button">Skills</button>}
        trailing={<button type="button">Send</button>}
      >
        <input aria-label="Message" data-inset-focus="" />
      </MessagePill>,
    );
    const pill = screen.getByLabelText('Message').parentElement;
    expect(pill.className).toContain('pill');
    // No second ring: the pill's hairline is the only one, so no inset bar and no accent border.
    expect(pill.className).not.toMatch(/inset|border-accent|rounded-xl/);
    const [skills, message, send] = pill.children;
    expect(skills.textContent).toBe('Skills');
    expect(message.getAttribute('aria-label')).toBe('Message');
    expect(send.textContent).toBe('Send');
  });
});

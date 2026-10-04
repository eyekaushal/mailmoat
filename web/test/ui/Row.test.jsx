import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Row } from '../../src/ui/Row.jsx';

describe('Row', () => {
  it('opens on click, keeps the actions outside the row button and hides the time for them', () => {
    const onOpen = vi.fn();
    const onArchive = vi.fn();
    render(
      <ul>
        <Row
          onOpen={onOpen}
          trailing={<time>09:41</time>}
          actions={
            <button type="button" onClick={onArchive}>
              Archive
            </button>
          }
        >
          <span>Rahul</span>
        </Row>
      </ul>,
    );
    const row = screen.getByRole('button', { name: /Rahul/ });
    expect(row.textContent).toContain('09:41');
    expect(row.querySelector('time').parentElement.className).toContain('group-hover:invisible');
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
    const archive = screen.getByRole('button', { name: 'Archive' });
    expect(row.contains(archive)).toBe(false);
    fireEvent.click(archive);
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('marks the selected row', () => {
    render(
      <ul>
        <Row selected>
          <span>Ada</span>
        </Row>
      </ul>,
    );
    const row = screen.getByRole('button', { name: 'Ada' });
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(row.className).toContain('bg-accent-soft');
  });
});

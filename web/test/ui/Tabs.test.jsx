import { fireEvent, render, screen } from '@testing-library/react';
import { Tray } from '@phosphor-icons/react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from '../../src/ui/Tabs.jsx';

const items = [
  { id: 'all', label: 'All', Icon: Tray, count: 12 },
  { id: 'fyi', label: 'FYI', count: 0 },
  { id: 'cold_email', label: 'Cold', count: 3 },
];

describe('Tabs', () => {
  it('marks the selected tab, shows counts above zero and reports a change', () => {
    const onChange = vi.fn();
    render(<Tabs label="Inbox tabs" value="all" items={items} onChange={onChange} />);
    const list = screen.getByRole('tablist', { name: 'Inbox tabs' });
    expect(list.querySelectorAll('[role="tab"]')).toHaveLength(3);
    const all = screen.getByRole('tab', { name: /All/ });
    expect(all.getAttribute('aria-selected')).toBe('true');
    expect(all.className).toContain('data-[state=active]:font-medium');
    expect(all.textContent).toContain('12');
    expect(screen.getByRole('tab', { name: /FYI/ }).textContent).toBe('FYI');
    expect(screen.getByRole('tab', { name: /Cold/ }).getAttribute('aria-selected')).toBe('false');
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Cold/ }), { button: 0 });
    expect(onChange).toHaveBeenCalledWith('cold_email');
  });
});

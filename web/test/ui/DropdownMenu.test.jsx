import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DropdownMenu, MenuHeader, MenuItem, MenuSeparator } from '../../src/ui/DropdownMenu.jsx';

describe('DropdownMenu', () => {
  it('opens from the trigger and runs the chosen item', async () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu trigger={<button type="button">More</button>}>
        <MenuHeader>Header</MenuHeader>
        <MenuSeparator />
        <MenuItem onSelect={onSelect}>Archive all</MenuItem>
        <MenuItem danger disabled>
          Block
        </MenuItem>
      </DropdownMenu>,
    );
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    const menu = await screen.findByRole('menu');
    expect(menu.textContent).toContain('Header');
    expect(screen.getByRole('menuitem', { name: 'Block' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive all' }));
    expect(onSelect).toHaveBeenCalled();
  });
});

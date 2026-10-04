import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { METHODS, SenderTable, percent } from '../../../src/pages/unsubscribe/SenderTable.jsx';
import { ApiClient } from '../../../src/lib/ApiClient.js';
import { ApiProvider } from '../../../src/lib/useApi.js';
import { TooltipProvider } from '../../../src/ui/Tooltip.jsx';
import { fakeServer } from '../../helpers.jsx';

const base = {
  name: 'Shop News',
  status: 'NONE',
  emailCount: 40,
  readCount: 10,
  readRate: 0.25,
  lastReceived: '2026-10-01T09:00:00.000Z',
  level: 'SAFE',
  method: 'unsubscribe',
  avatar: { initials: 'SN', hue: 200 },
};

function mount(senders, props = {}) {
  const client = new ApiClient({ fetch: fakeServer({}).fetch });
  return render(
    <ApiProvider client={client}>
      <TooltipProvider>
        <SenderTable
          senders={senders}
          selected={new Set()}
          onToggle={() => {}}
          onToggleAll={() => {}}
          sort="count"
          onSort={() => {}}
          onAction={() => {}}
          busy={null}
          {...props}
        />
      </TooltipProvider>
    </ApiProvider>,
  );
}

describe('SenderTable', () => {
  it('shows avatar, name and address, the count, the read bar and one method button', () => {
    mount([{ ...base, address: 'news@shop.example' }]);
    expect(screen.getByText('SN')).toBeTruthy();
    expect(screen.getByText('Shop News')).toBeTruthy();
    expect(screen.getByText('news@shop.example')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Read' }).getAttribute('aria-valuenow')).toBe(
      '25',
    );
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Block' })).toBeNull();
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy();
    expect(screen.queryByText(/risk/i)).toBeNull();
  });

  it('gives a flagged sender Block with the method hint, never a risk word', () => {
    mount([{ ...base, address: 'promo@evil.example', level: 'DANGEROUS', method: 'report_spam' }]);
    const block = screen.getByRole('button', { name: 'Block' });
    expect(block.className).toContain('text-danger');
    expect(METHODS.report_spam.action).toBe('block');
    expect(screen.queryByText('Dangerous')).toBeNull();
  });

  it('replaces the buttons with the status word once decided', () => {
    mount([{ ...base, address: 'a@x.example', status: 'BLOCKED' }]);
    expect(screen.getByText('blocked')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Block' })).toBeNull();
  });

  it('sorts from the Emails and Read headers', () => {
    const onSort = vi.fn();
    mount([{ ...base, address: 'a@x.example' }], { onSort });
    expect(screen.getByRole('columnheader', { name: /Emails/ }).getAttribute('aria-sort')).toBe(
      'descending',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(onSort).toHaveBeenCalledWith('read');
  });

  it('rounds the read rate', () => {
    expect(percent(0.333)).toBe('33%');
    expect(percent(undefined)).toBe('0%');
  });
});

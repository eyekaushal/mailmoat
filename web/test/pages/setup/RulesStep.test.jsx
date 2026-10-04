import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RulesStep } from '../../../src/pages/setup/RulesStep.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const rules = [
  {
    id: 'dangerous',
    name: 'Dangerous',
    description: 'Risk DANGEROUS.',
    isSecurity: true,
    enabled: true,
    actions: ['label', 'alert'],
    allowedActions: ['label', 'alert'],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    description: 'Promotions.',
    isSecurity: false,
    enabled: true,
    actions: ['label', 'archive'],
    allowedActions: ['label', 'archive'],
  },
];

describe('RulesStep', () => {
  it('lists rules, locks security ones and toggles the rest through PATCH', async () => {
    const server = fakeServer({
      'GET /rules': rules,
      'PATCH /rules/marketing': (body) => ({ ...rules[1], enabled: body.enabled }),
    });
    const onFinish = vi.fn();
    renderPage(<RulesStep onFinish={onFinish} />, { server });
    await waitFor(() => expect(screen.getByText('Marketing')).toBeTruthy());
    expect(screen.getByRole('switch', { name: 'Dangerous enabled' }).disabled).toBe(true);
    expect(screen.getByLabelText('Always on')).toBeTruthy();
    expect(screen.getAllByText('Label')).toHaveLength(2);
    expect(screen.getByText('Archive')).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: 'Marketing enabled' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
    const patch = server.calls.find((call) => call.method === 'PATCH');
    expect(patch).toEqual({ method: 'PATCH', path: '/rules/marketing', body: { enabled: false } });
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(onFinish).toHaveBeenCalled();
  });
});

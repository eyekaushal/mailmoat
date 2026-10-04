import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThreatFeed } from '../../../src/pages/security/ThreatFeed.jsx';
import { fakeServer, renderPage } from '../../helpers.jsx';

const item = (overrides = {}) => ({
  gmailId: 'g1',
  fromAddr: 'ceo@acme-corp.co',
  fromName: 'The CEO',
  date: '2026-10-02T09:00:00Z',
  level: 'DANGEROUS',
  score: 90,
  reasons: ['Look-alike domain <b>x</b>', 'Asks for a wire', 'Urgent', 'fourth'],
  injectionAttempt: false,
  userFeedback: null,
  ...overrides,
});

describe('ThreatFeed', () => {
  it('links every item to the email with its trace and shows at most three reasons as text', async () => {
    renderPage(<ThreatFeed />, { server: fakeServer({ 'GET /security/feed': [item()] }) });
    const link = await screen.findByRole('link', { name: 'Open The CEO and its trace' });
    expect(link.getAttribute('href')).toBe('/inbox/g1?trace=1');
    expect(link.textContent).toContain('Look-alike domain <b>x</b> · Asks for a wire · Urgent');
    expect(link.textContent).not.toContain('fourth');
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getByText('ceo@acme-corp.co')).toBeTruthy();
  });

  it('marks risk with the dot and its word, and notes your feedback and blocked injections', async () => {
    renderPage(<ThreatFeed />, {
      server: fakeServer({
        'GET /security/feed': [
          item({ level: 'SUSPICIOUS', userFeedback: 'not_phishing' }),
          item({ gmailId: 'g2', fromName: null, injectionAttempt: true }),
        ],
      }),
    });
    expect(await screen.findByRole('img', { name: 'Suspicious' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Dangerous' })).toBeTruthy();
    expect(screen.getByText('you: not phishing')).toBeTruthy();
    expect(screen.getByText('injection attempt blocked')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open ceo@acme-corp.co and its trace' })).toBeTruthy();
    expect(screen.queryByText('Dangerous')).toBeNull();
  });

  it('says so when nothing was flagged', async () => {
    renderPage(<ThreatFeed />, { server: fakeServer({ 'GET /security/feed': [] }) });
    await waitFor(() => expect(screen.getByText(/No suspicious or dangerous email/)).toBeTruthy());
  });
});

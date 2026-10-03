import { describe, expect, it } from 'vitest';
import { EmailFacts, EmailFactsSchema } from '../../../src/agent/EmailFacts.js';
import { FORM, RECORD, VERDICT } from '../../helpers/agentFixtures.js';

describe('EmailFacts', () => {
  it('builds exactly the whitelisted typed fields', () => {
    const facts = EmailFacts.from({
      record: { ...RECORD, fromName: 'EVIL', subject: 'x' },
      form: FORM,
      verdict: VERDICT,
    });
    expect(Object.keys(facts).sort()).toEqual([
      'category',
      'date',
      'direction',
      'from',
      'handles',
      'id',
      'intents',
      'meeting_request',
      'needs_reply',
      'risk',
    ]);
    expect(facts.from).toEqual({ address: 'rahul@acme.example', domain: 'acme.example' });
    expect(facts.handles).toEqual({ summary: '$email_18f3a.summary', body: '$email_18f3a.body' });
    expect(JSON.stringify(facts)).not.toContain('EVIL');
    expect(JSON.stringify(facts)).not.toContain(FORM.summary);
  });

  it('nulls an invalid sender address and missing Reader/verdict data', () => {
    const facts = EmailFacts.from({
      record: { ...RECORD, fromAddr: 'not an address' },
      form: null,
      verdict: null,
    });
    expect(facts.from).toEqual({ address: null, domain: null });
    expect(facts.risk).toBeNull();
    expect(facts.category).toBeNull();
    expect(facts.intents).toBeNull();
  });

  it('rejects a smuggled free-text field at the schema', () => {
    const facts = EmailFacts.from({ record: RECORD, form: FORM, verdict: VERDICT });
    expect(EmailFactsSchema.safeParse({ ...facts, summary: 'text' }).success).toBe(false);
  });

  it('tags values to the email and its participants', () => {
    const tagged = EmailFacts.tag('x', {
      ...RECORD,
      toAddrs: ['Me@example.com', 'cc@acme.example'],
    });
    expect(tagged.sources).toEqual([{ type: 'email', id: '18f3a' }]);
    expect([...tagged.readers]).toEqual([
      'rahul@acme.example',
      'me@example.com',
      'cc@acme.example',
    ]);
  });
});

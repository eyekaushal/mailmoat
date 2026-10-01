import { describe, expect, it } from 'vitest';
import { ReplyToMismatchSignal } from '../../../../../src/security/signals/sender/ReplyToMismatchSignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new ReplyToMismatchSignal();
const replyTo = (...addresses) =>
  ingestedEmail({ replyTo: addresses.map((address) => ({ address, name: null })) });

describe('ReplyToMismatchSignal (S4)', () => {
  it('fires when replies go to another organisation (BEC)', () => {
    expect(signal.evaluate(replyTo('rahul.ceo.office@gmail.com'), signalContext())).toMatchObject({
      id: 'S4',
      severity: 'medium',
      reason: "Replies go to rahul.ceo.office@gmail.com, not to the sender's domain acme-corp.com.",
    });
  });

  it('cannot be silenced by adding a List-Id header', () => {
    const email = {
      ...replyTo('x@evil.example'),
      headers: [{ key: 'list-id', value: '<news.acme-corp.com>' }],
    };
    expect(signal.evaluate(email, signalContext())).not.toBeNull();
  });

  it('does not fire for the same organisation or no Reply-To', () => {
    expect(signal.evaluate(replyTo('support@help.acme-corp.com'), signalContext())).toBeNull();
    expect(signal.evaluate(replyTo(), signalContext())).toBeNull();
  });

  it('does not fire for a Reply-To the user has written to', () => {
    const context = signalContext({ 'team@lists.example': { sentCount: 2 } });
    expect(signal.evaluate(replyTo('team@lists.example'), context)).toBeNull();
  });

  it('still fires for a Reply-To the user only received from', () => {
    const context = signalContext({ 'x@evil.example': { receivedCount: 5 } });
    expect(signal.evaluate(replyTo('x@evil.example'), context)).not.toBeNull();
  });
});

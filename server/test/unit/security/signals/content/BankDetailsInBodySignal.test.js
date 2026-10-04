import { describe, expect, it } from 'vitest';
import { BankDetailsInBodySignal } from '../../../../../src/security/signals/content/BankDetailsInBodySignal.js';
import { ingestedEmail, signalContext } from '../fixtures.js';

const signal = new BankDetailsInBodySignal();
const text = (readerText, subject = 'Invoice') =>
  signal.evaluate(ingestedEmail({ readerText, subject }), signalContext());

describe('BankDetailsInBodySignal (S21)', () => {
  it.each([
    'Please pay to Orion Print Co, A/C 9988776655, IFSC ICIC0000221, and email the UTR.',
    'Wire to IBAN DE89370400440532013000 by Friday.',
    'Account number: 0123 4567 8901, sort code 20-00-00.',
    'SWIFT: CHASUS33 for international transfers.',
    'Routing number 021000021, acct # 123456789',
  ])('fires for payment instructions in the body: %s', (body) => {
    expect(text(body)).toMatchObject({
      id: 'S21',
      severity: 'medium',
      reason: 'The email itself contains bank account details for a payment.',
    });
  });

  it('does not fire for receipts, order numbers and masked accounts', () => {
    expect(
      text('Your bill for consumer no. 900211 is ₹2,310, due 10 October. Pay online.'),
    ).toBeNull();
    expect(text('Order #4521-9981 shipped. Card ending 4242 was charged.')).toBeNull();
    expect(text('Your account was accessed from a new device.')).toBeNull();
    expect(text('')).toBeNull();
  });

  it('reads the subject too', () => {
    expect(text('Thanks.', 'Pay to IBAN GB29NWBK60161331926819 today')).not.toBeNull();
  });
});

import { Signal } from '../Signal.js';

// Payment instructions written into the email itself: the signature of invoice fraud and BEC,
// where a legitimate first bill instead links to the biller's own site.
const PATTERNS = [
  /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{0,19}\b/, // IBAN
  /\b[A-Z]{4}0[A-Z0-9]{6}\b/, // IFSC
  /\b(?:swift|bic)\b\s*(?:code)?\s*[:.]?\s*[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/i,
  /\b(?:a\/c|acct\.?|account)\s*(?:no\.?|number|#)?\s*[:.]?\s*\d[\d -]{5,}\d\b/i,
  /\b(?:routing|aba)\s*(?:number|no\.?|#)?\s*[:.]?\s*\d{9}\b/i,
  /\bsort\s*code\s*[:.]?\s*\d{2}[- ]?\d{2}[- ]?\d{2}\b/i,
];

/** S21: the visible text contains bank account details (account number, IBAN, IFSC, SWIFT…). */
export class BankDetailsInBodySignal extends Signal {
  constructor() {
    super({ id: 'S21', name: 'BANK_DETAILS_IN_BODY', severity: 'medium' });
  }

  evaluate(email) {
    const text = `${email.subject ?? ''}\n${email.readerText ?? ''}`;
    if (!PATTERNS.some((pattern) => pattern.test(text))) return null;
    return this.fire('The email itself contains bank account details for a payment.');
  }
}

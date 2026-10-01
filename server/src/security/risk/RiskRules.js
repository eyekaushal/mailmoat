/**
 * @typedef {import('@mailmoat/shared/schemas/reader-form').ReaderForm} ReaderForm
 * @typedef {object} RuleInput
 * @property {(id: string) => boolean} has whether a signal fired
 * @property {ReaderForm | null} form null when the Reader failed
 * @property {boolean} readerFailed
 * @typedef {object} RiskRule
 * @property {'SUSPICIOUS'|'DANGEROUS'} level the minimum level when the rule matches
 * @property {string} reason plain English, fixed text (never quotes the email)
 * @property {(input: RuleInput) => boolean} when
 * @property {boolean} [injection] marks the email as an injection attempt
 * @property {boolean} [verifyByPhone] show the "verify by phone" banner
 */

const IDENTITY_CLAIMS = new Set(['executive', 'bank', 'brand', 'it_support', 'government']);
const intent = (input, name) => input.form?.intents[name] === true;
const asksForMoney = (input) =>
  intent(input, 'asks_for_payment') || intent(input, 'asks_bank_detail_change');

/**
 * The Risk Engine's tables (SECURITY_APPROACH §7.4), as data. Floors come from facts an attacker
 * cannot fake, plus fail-closed cases; combinations let the Reader's intents raise the level.
 * Weights and bands only rank emails and are tuned through the attack lab, never by hand.
 */
export class RiskRules {
  /** @type {RiskRule[]} Step 1: the Reader cannot lower these. */
  floorRules = [
    {
      level: 'DANGEROUS',
      reason: 'The sender failed DMARC and impersonates a brand or contact.',
      when: (i) => i.has('S1') && (i.has('S6') || i.has('S7')),
    },
    {
      level: 'DANGEROUS',
      reason: 'The sender domain imitates a domain you email.',
      when: (i) => i.has('S5'),
    },
    {
      level: 'DANGEROUS',
      reason: 'Hidden instructions aimed at an AI assistant: prompt-injection attempt.',
      when: (i) => i.has('S13'),
      injection: true,
    },
    {
      level: 'DANGEROUS',
      reason: 'The email contains a disguised link or a login form.',
      when: (i) => i.has('S17') || i.has('S20'),
    },
    {
      level: 'SUSPICIOUS',
      reason: 'The sender, a link or an attachment is deceptive or risky.',
      when: (i) => ['S6', 'S7', 'S8', 'S14', 'S19'].some((id) => i.has(id)),
    },
    {
      level: 'SUSPICIOUS',
      reason: 'The sender could not be authenticated.',
      when: (i) => i.has('S1') || i.has('S2'),
    },
    {
      level: 'SUSPICIOUS',
      reason: 'The email hides text from you.',
      when: (i) => i.has('S12'),
    },
    {
      level: 'SUSPICIOUS',
      reason: 'mailmoat could not fully check this email.',
      when: (i) => i.readerFailed || i.has('S0'),
    },
  ];

  /** @type {RiskRule[]} Step 2: Reader intents × identity signals. */
  combinationRules = [
    {
      level: 'SUSPICIOUS',
      reason:
        'Asks to change bank or payment details. Verify by phone using a number you already have.',
      when: (i) => intent(i, 'asks_bank_detail_change'),
      verifyByPhone: true,
    },
    {
      level: 'DANGEROUS',
      reason: 'Asks for a payment or bank change from an unverified or unfamiliar sender.',
      when: (i) => asksForMoney(i) && ['S4', 'S9', 'S10', 'S11'].some((id) => i.has(id)),
      verifyByPhone: true,
    },
    {
      level: 'DANGEROUS',
      reason: 'Asks you to log in or share a code, from a new sender or through a suspicious link.',
      when: (i) =>
        intent(i, 'asks_for_credentials') && ['S9', 'S14', 'S18'].some((id) => i.has(id)),
    },
    {
      level: 'SUSPICIOUS',
      reason:
        'Claims to be an executive, bank, brand, IT or government sender you have no history with.',
      when: (i) =>
        IDENTITY_CLAIMS.has(i.form?.claims_to_be) && ['S7', 'S9', 'S10'].some((id) => i.has(id)),
    },
    {
      level: 'DANGEROUS',
      reason: 'Urgent and secret request for money or credentials.',
      when: (i) =>
        i.form?.urgency === 'high' &&
        intent(i, 'asks_for_secrecy') &&
        (asksForMoney(i) || intent(i, 'asks_for_credentials')),
    },
    {
      level: 'DANGEROUS',
      reason:
        'Asks you to call a number, claiming to be a company; first message from this sender.',
      when: (i) =>
        intent(i, 'asks_to_call_number') && i.form?.claims_to_be === 'brand' && i.has('S9'),
    },
    {
      level: 'SUSPICIOUS',
      reason: 'The email tries to instruct an AI assistant.',
      when: (i) => intent(i, 'asks_to_change_ai_behaviour'),
      injection: true,
    },
  ];

  #weights = { low: 8, medium: 20, high: 45 };
  #bands = [
    { minScore: 80, level: 'DANGEROUS' },
    { minScore: 40, level: 'SUSPICIOUS' },
  ];

  /** @param {'low'|'medium'|'high'} severity */
  weightFor(severity) {
    return this.#weights[severity];
  }

  /** @returns {'SAFE'|'SUSPICIOUS'|'DANGEROUS'} */
  bandFor(score) {
    return this.#bands.find((band) => score >= band.minScore)?.level ?? 'SAFE';
  }
}

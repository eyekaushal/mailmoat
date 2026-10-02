/** A valid Reader form for tests (meeting request from a colleague). */
export const VALID_FORM = {
  category: 'work',
  needs_reply: true,
  intents: {
    asks_for_payment: false,
    asks_bank_detail_change: false,
    asks_for_credentials: false,
    asks_to_open_attachment: false,
    asks_to_click_link: false,
    asks_to_call_number: false,
    asks_for_secrecy: false,
    asks_to_change_ai_behaviour: false,
  },
  urgency: 'normal',
  claims_to_be: 'colleague',
  claimed_brand: null,
  meeting_request: { proposed_times: ['2026-10-09T17:00', '2026-10-09T17:00:00+05:30'] },
  expects_reply: false,
  summary: 'The sender asks to meet on Friday at 5 pm.',
};

import { Signal } from '../Signal.js';

const TEXT_TECHNIQUES = new Set([
  'display_none',
  'visibility_hidden',
  'opacity_zero',
  'tiny_font',
  'offscreen',
  'clipped',
  'color_matches_background',
  'html_comment',
  'attribute_text',
]);
// Only wording that speaks *to* an AI; bare "agent", "bot" or "assistant" appear in ordinary mail.
const AI = String.raw`(?:ai|a\.i\.|ai assistant|ai agent|email assistant|llm|language model|copilot|gemini|claude|chatgpt|gpt|mailmoat|ki|ki-assistent|ia|assistant ia|asistente de ia)`;
const ADDRESSES_AN_AI = [
  new RegExp(String.raw`\b${AI}\s*[:,]`, 'i'),
  new RegExp(String.raw`\b(dear|attention|note (to|for)|hey|hi|hello)\b[^.]{0,20}\b${AI}\b`, 'i'),
  new RegExp(String.raw`\bif you are an? ${AI}\b`, 'i'),
  new RegExp(
    String.raw`\b${AI}s? (reading|processing|summari[sz]ing|parsing|handling) (this|the)\b`,
    'i',
  ),
];
const ACTION =
  /\b(forward|send|reply|respond|email|transfer|wire|pay|delete|archive|label|mark|click|open|download|create|schedule|unsubscribe|remember|save|store|summari[sz]e|classify|ignore|approve|share|export|call)\b/i;
const OVERRIDE_PHRASES = [
  /\b(ignore|disregard|forget|override|bypass)\b[^.]{0,40}\b(previous|prior|above|earlier|all|any|your|the)\b[^.]{0,20}\b(instructions?|rules|prompts?|guidelines|directions|policies)\b/i,
  // "You are now subscribed" or "From now on, free shipping" are everyday preheaders, so not here.
  /\b(system prompt|new instructions|pretend (to be|you are)|developer mode|jailbreak)\b/i,
  /\bdo not (tell|mention|inform|alert|warn|reveal|show)\b[^.]{0,30}\b(user|owner|recipient|human)\b/i,
  // The same override in German, French and Spanish: hidden text is not always in English.
  /\b(ignoriere|ignorieren sie|missachte|vergiss|überschreibe)\b[^.]{0,40}\b(anweisungen|anweisung|regeln|befehle|vorgaben)\b/i,
  /\b(ignore[sz]?|oublie[sz]?|outrepasse[sz]?)\b[^.]{0,40}\b(instructions|consignes|règles|regles)\b/i,
  /\b(ignora|ignorar|olvida|olvidar|omite)\b[^.]{0,40}\b(instrucciones|reglas|indicaciones)\b/i,
];
// Our own tool names in snake_case; prose never contains them by accident.
const TOOL_NAMES =
  /\b(send_email|create_draft|apply_label|mark_read|create_calendar_event|get_free_busy|search_emails|get_email_fields|block_sender|save_memory)\b/i;

/**
 * S13: hidden text is written as instructions to an AI: the signature of indirect prompt
 * injection. A person never sees it, so it can only be meant for a machine.
 */
export class HiddenTextInstructionsSignal extends Signal {
  constructor() {
    super({ id: 'S13', name: 'HIDDEN_TEXT_INSTRUCTIONS', severity: 'high' });
  }

  evaluate(email) {
    const injected = email.hidden
      .filter((item) => TEXT_TECHNIQUES.has(item.technique))
      .some((item) => this.#isInstruction(item.text));
    if (!injected) return null;
    return this.fire('Hidden text in this email contains instructions aimed at an AI assistant.');
  }

  #isInstruction(text) {
    // German/French/Spanish overrides carry their own imperative, so no ACTION check is needed.
    return (
      (ADDRESSES_AN_AI.some((pattern) => pattern.test(text)) && ACTION.test(text)) ||
      OVERRIDE_PHRASES.some((pattern) => pattern.test(text)) ||
      TOOL_NAMES.test(text)
    );
  }
}

/**
 * How a draft may be revised (PLAN §16.2 decisions 5 and 6). Both lists are closed: the Drafter
 * receives a fixed sentence per entry, written by code, never free text about tone or task.
 */
export const DRAFT_TONES = Object.freeze(['formal', 'semi-formal', 'casual']);
export const DEFAULT_DRAFT_TONE = 'formal';
export const DRAFT_SKILLS = Object.freeze([
  'rewrite',
  'humanize',
  'tone',
  'shorter',
  'longer',
  'proofread',
  'complete',
]);

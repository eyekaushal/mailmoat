/**
 * Actions a predefined rule may take (PRD F4). `label`, `archive` and `draft_reply` are the
 * user-selectable ones; `alert` and `log` belong to the always-on security rules and mean
 * "write an audit entry the Security Center shows" — the labels themselves are applied by the
 * security pipeline, never by a rule the user could switch off.
 */
export const RULE_ACTIONS = Object.freeze(['label', 'archive', 'draft_reply', 'alert', 'log']);

/** Outcome of running one rule's actions on one email. */
export const RULE_RUN_STATUSES = Object.freeze(['done', 'failed']);

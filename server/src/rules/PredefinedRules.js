import { SECURITY_LABELS } from '@mailmoat/shared/constants/labels';

/**
 * @typedef {object} RuleFacts typed facts only — never email text (PRD F4: rules match in code)
 * @property {'inbound'|'outbound'} direction
 * @property {'SAFE'|'SUSPICIOUS'|'DANGEROUS'|null} level null for the user's own sent mail
 * @property {boolean} injectionAttempt the Risk Engine's flag
 * @property {import('@mailmoat/shared/schemas/reader-form').ReaderForm | null} form
 * @property {boolean} firstTimeSender the user has never written to the sender (signal S9)
 * @property {boolean} lastInThreadFromUser the newest message in the thread is the user's own
 */

/**
 * @typedef {object} RuleDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {boolean} isSecurity always on; actions fixed
 * @property {'inbound'|'outbound'} appliesTo
 * @property {string} label the Gmail label the `label` action applies
 * @property {string[]} defaultActions
 * @property {string[]} allowedActions what the user may pick (equals `defaultActions` for security rules)
 * @property {(facts: RuleFacts) => boolean} matches
 */

const ORGANISE = Object.freeze(['label', 'archive']);
const ORGANISE_OR_DRAFT = Object.freeze(['label', 'archive', 'draft_reply']);

/**
 * The 12 predefined rules of PRD F4, in evaluation order. Security rules come first and are
 * evaluated together (an email can be both DANGEROUS and an injection attempt); the assistant
 * rules are tried in order and the first match wins, so an email gets at most one assistant rule.
 */
export class PredefinedRules {
  /** @returns {Readonly<RuleDefinition[]>} */
  list() {
    return PredefinedRules.#ALL;
  }

  /** @returns {RuleDefinition | undefined} */
  get(id) {
    return PredefinedRules.#ALL.find((rule) => rule.id === id);
  }

  static #ALL = Object.freeze(
    [
      {
        id: 'suspicious',
        name: 'Suspicious',
        description: 'Risk verdict SUSPICIOUS: labelled and shown in the Security Center.',
        isSecurity: true,
        appliesTo: 'inbound',
        label: SECURITY_LABELS.SUSPICIOUS,
        defaultActions: ['label', 'alert'],
        matches: (f) => f.level === 'SUSPICIOUS',
      },
      {
        id: 'dangerous',
        name: 'Dangerous',
        description:
          'Risk verdict DANGEROUS: labelled and shown in the Security Center; archived if that setting is on.',
        isSecurity: true,
        appliesTo: 'inbound',
        label: SECURITY_LABELS.DANGEROUS,
        defaultActions: ['label', 'alert'],
        matches: (f) => f.level === 'DANGEROUS',
      },
      {
        id: 'injection_attempt',
        name: 'Injection attempt',
        description: 'The email tries to instruct an AI assistant: labelled and logged.',
        isSecurity: true,
        appliesTo: 'inbound',
        label: SECURITY_LABELS.INJECTION,
        defaultActions: ['label', 'log'],
        matches: (f) => f.injectionAttempt,
      },
      {
        id: 'to_reply',
        name: 'To Reply',
        description: 'Needs an answer from you and the other party spoke last.',
        isSecurity: false,
        appliesTo: 'inbound',
        label: 'To Reply',
        defaultActions: ['label', 'draft_reply'],
        allowedActions: ORGANISE_OR_DRAFT,
        matches: (f) => f.form?.needs_reply === true && !f.lastInThreadFromUser,
      },
      {
        id: 'awaiting_reply',
        name: 'Awaiting Reply',
        description: 'You wrote last and asked for a reply.',
        isSecurity: false,
        appliesTo: 'outbound',
        label: 'Awaiting Reply',
        defaultActions: ['label'],
        allowedActions: ORGANISE,
        matches: (f) => f.form?.expects_reply === true && f.lastInThreadFromUser,
      },
      {
        id: 'fyi',
        name: 'FYI',
        description: 'Work or personal mail that needs no reply.',
        isSecurity: false,
        appliesTo: 'inbound',
        label: 'FYI',
        defaultActions: ['label'],
        allowedActions: ORGANISE,
        matches: (f) =>
          (f.form?.category === 'work' || f.form?.category === 'personal') &&
          f.form.needs_reply === false,
      },
      {
        id: 'newsletter',
        name: 'Newsletter',
        description: 'Newsletters and digests.',
        isSecurity: false,
        appliesTo: 'inbound',
        label: 'Newsletter',
        defaultActions: ['label'],
        allowedActions: ORGANISE,
        matches: (f) => f.form?.category === 'newsletter',
      },
      {
        id: 'marketing',
        name: 'Marketing',
        description: 'Promotions and offers.',
        isSecurity: false,
        appliesTo: 'inbound',
        label: 'Marketing',
        defaultActions: ['label', 'archive'],
        allowedActions: ORGANISE,
        matches: (f) => f.form?.category === 'marketing',
      },
      {
        id: 'calendar',
        name: 'Calendar',
        description: 'Invitations and meeting requests.',
        isSecurity: false,
        appliesTo: 'inbound',
        label: 'Calendar',
        defaultActions: ['label'],
        allowedActions: ORGANISE,
        matches: (f) =>
          f.form?.category === 'calendar' ||
          (f.form?.meeting_request !== null && f.form?.meeting_request !== undefined),
      },
      {
        id: 'receipt',
        name: 'Receipt',
        description: 'Receipts, invoices and order confirmations.',
        isSecurity: false,
        appliesTo: 'inbound',
        label: 'Receipt',
        defaultActions: ['label'],
        allowedActions: ORGANISE,
        matches: (f) => f.form?.category === 'receipt',
      },
      {
        id: 'notification',
        name: 'Notification',
        description: 'Automated notifications and account alerts.',
        isSecurity: false,
        appliesTo: 'inbound',
        label: 'Notification',
        defaultActions: ['label'],
        allowedActions: ORGANISE,
        matches: (f) =>
          f.form?.category === 'notification' || f.form?.category === 'security_alert',
      },
      {
        id: 'cold_email',
        name: 'Cold Email',
        description: 'Unsolicited outreach from someone you have never written to.',
        isSecurity: false,
        appliesTo: 'inbound',
        label: 'Cold Email',
        defaultActions: ['label', 'archive'],
        allowedActions: ORGANISE,
        matches: (f) => f.form?.category === 'cold_outreach' && f.firstTimeSender,
      },
    ].map((rule) =>
      Object.freeze({
        ...rule,
        defaultActions: Object.freeze([...rule.defaultActions]),
        allowedActions: Object.freeze([...(rule.allowedActions ?? rule.defaultActions)]),
      }),
    ),
  );
}

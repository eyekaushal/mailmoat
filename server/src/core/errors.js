/** Base class so callers can tell mailmoat errors from library/runtime errors. */
export class MailmoatError extends Error {
  /**
   * @param {string} message
   * @param {{ cause?: unknown }} [options]
   */
  constructor(message, options) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

/** Invalid or missing configuration. */
export class ConfigError extends MailmoatError {}

/** A secret could not be stored, read or decrypted. */
export class SecretStoreError extends MailmoatError {}

/** A database migration failed. */
export class MigrationError extends MailmoatError {}

/** The Google sign-in flow failed or returned something unsafe/incomplete. */
export class GoogleAuthError extends MailmoatError {}

/** An operation needs a Google account but none is connected. */
export class NotConnectedError extends MailmoatError {}

/** Gmail no longer has history that far back; sync must restart from a fresh history ID. */
export class HistoryExpiredError extends MailmoatError {}

/** A raw message could not be parsed; the pipeline must treat the email as suspicious. */
export class IngestError extends MailmoatError {}

/** A model call failed (network, timeout, API error). Callers must fail closed. */
export class LlmError extends MailmoatError {}

/** The model declined to answer (`stop_reason: refusal`), even after any fallback. */
export class LlmRefusalError extends LlmError {}

/** The model answered, but not with output that passes our schema. Never trust partial output. */
export class LlmOutputError extends LlmError {}

/** The Planner produced no usable plan (model failure, refusal or invalid output). Nothing runs. */
export class PlanError extends MailmoatError {}

/** An opaque handle is malformed, unknown or could not be loaded. The step must be denied. */
export class HandleError extends MailmoatError {}

/** A tool is unknown, got invalid arguments or failed while running. The plan must stop. */
export class ToolError extends MailmoatError {}

/** An approval does not exist or is no longer pending. */
export class ApprovalError extends MailmoatError {}

/** A memory write was attempted with content that did not come from the user (invariant 7). */
export class MemoryError extends MailmoatError {}

/** A rule setting is invalid (unknown rule, security rule, disallowed action) or an action failed. */
export class RuleError extends MailmoatError {}

/** A reply could not be drafted: unknown or risky email, or the quarantined Drafter failed. */
export class DraftError extends MailmoatError {}

/** A meeting could not be proposed or saved: unknown or risky email, no times, or policy denied. */
export class MeetingError extends MailmoatError {}

/** A chat does not exist, or a chat message could not be handled. */
export class ChatError extends MailmoatError {}

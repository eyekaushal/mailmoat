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

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

import { PolicyRule } from './PolicyRule.js';

/** Reading the user's own data has no side effects: always allowed. */
export class ReadRule extends PolicyRule {
  constructor() {
    super(['search_emails', 'get_email_fields', 'summarise', 'extract', 'get_free_busy']);
  }

  decide() {
    return this.allow("Reads the user's own data; no side effects");
  }
}

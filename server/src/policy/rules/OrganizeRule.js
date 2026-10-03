import { PolicyRule } from './PolicyRule.js';

/** Labelling, archiving and marking read are reversible in Gmail: allowed and logged. */
export class OrganizeRule extends PolicyRule {
  constructor() {
    super(['apply_label', 'archive', 'mark_read']);
  }

  decide() {
    return this.allow('Reversible inbox change');
  }
}

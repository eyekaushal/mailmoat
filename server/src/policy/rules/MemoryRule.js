import { PolicyRule } from './PolicyRule.js';

/** Memory is written only from the user's own words (invariant 7, PRD F8.6). */
export class MemoryRule extends PolicyRule {
  constructor() {
    super(['save_memory']);
  }

  decide(call) {
    const tainted = Object.entries(call.args).find(([, v]) => !v.onlySources('user'));
    if (tainted) return this.deny(`Memory can only hold your own words ("${tainted[0]}" is not)`);
    return this.allow('Remembering your own words');
  }
}

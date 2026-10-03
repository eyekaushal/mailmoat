import { maxRiskLevel } from '@mailmoat/shared/constants/risk-levels';
import { Decision } from '../Decision.js';

/**
 * @typedef {import('../../agent/PlanInterpreter.js').ToolCall} ToolCall
 * @typedef {{
 *   levels: Record<string, 'SAFE'|'SUSPICIOUS'|'DANGEROUS'>,  risk of every email the call touches
 *   participants: Record<string, string[]>,                  sender + recipients of each
 * }} PolicyContext
 */

/** Base class for the rules in SECURITY_APPROACH §7.6. One rule per tool family. */
export class PolicyRule {
  /** @param {string[]} tools the tool names this rule governs */
  constructor(tools) {
    this.tools = Object.freeze([...tools]);
  }

  /** @param {string} tool */
  applies(tool) {
    return this.tools.includes(tool);
  }

  /**
   * @param {ToolCall} _call
   * @param {PolicyContext} _context
   * @returns {Decision}
   */
  decide(_call, _context) {
    throw new Error(`${this.constructor.name} does not implement decide`);
  }

  allow(reason) {
    return Decision.allow(reason, this.constructor.name);
  }

  ask(reason) {
    return Decision.ask(reason, this.constructor.name);
  }

  deny(reason) {
    return Decision.deny(reason, this.constructor.name);
  }

  /** The worst risk level among the emails the call touches, or null when it touches none. */
  worstLevel(call, context) {
    const levels = call.emailIds.map((id) => context.levels[id] ?? 'SUSPICIOUS');
    return levels.length === 0 ? null : maxRiskLevel(...levels);
  }

  /**
   * Addresses in the named list arguments, flattened and lower-cased.
   * @param {ToolCall} call
   * @param {string[]} names
   */
  addressesIn(call, names) {
    return names.flatMap((name) => {
      const value = call.args[name]?.value;
      return Array.isArray(value) ? value.map((a) => String(a).toLowerCase()) : [];
    });
  }

  /**
   * The first named argument whose value did not come from the user: recipients and attendees
   * may be typed by the user or come from the user's own data, never from an email or from the
   * Planner's own guess (which could be an address it saw in an email's typed fields).
   * @param {ToolCall} call
   * @param {string[]} names
   * @returns {string | null} the offending argument name
   */
  argumentNotFromUser(call, names) {
    for (const name of names) {
      const tagged = call.args[name];
      if (tagged && !tagged.sources.every((s) => s.type === 'user' || s.type === 'contacts')) {
        return name;
      }
    }
    return null;
  }

  /**
   * The exfiltration guard: every recipient must be allowed to read every content argument.
   * @param {ToolCall} call
   * @param {string[]} contentNames
   * @param {string[]} recipients
   * @returns {string | null} the content argument some recipient may not see
   */
  contentNotReadableBy(call, contentNames, recipients) {
    for (const name of contentNames) {
      const tagged = call.args[name];
      if (tagged && recipients.some((address) => !tagged.isReadableBy(address))) return name;
    }
    return null;
  }
}

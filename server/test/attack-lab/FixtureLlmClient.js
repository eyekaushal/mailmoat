import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LlmError, LlmOutputError } from '../../src/core/errors.js';

/**
 * @typedef {{ role: string, model: string, output?: unknown, error?: string }} RecordedCall
 * @typedef {{ recordedAt: string | null, calls: RecordedCall[] }} CaseFixture
 */

/**
 * Stand-in for LlmClient that makes the attack lab free to run in CI (PRD F13.3).
 *
 * `record` mode wraps the real client, passes every call through and stores each role's outputs
 * (or the error class, so a refusal replays as a refusal) under the current case. `replay` mode
 * answers from the stored fixtures and never touches the network. Fixtures live in one JSON file
 * per corpus set (`fixtures/<set>.json`), keyed by case name; a missing fixture throws an
 * `LlmError`, so the Reader fails closed exactly as it would on a network failure, and the lab
 * reports the gap.
 */
export class FixtureLlmClient {
  #dir;
  #mode;
  #inner;
  #modelFor;
  /** @type {Map<string, Record<string, CaseFixture>>} set → case → fixture */
  #sets = new Map();
  #dirtySets = new Set();
  #missing = [];
  #current = null;

  /**
   * @param {object} options
   * @param {string} options.dir fixtures directory
   * @param {'replay'|'record'} options.mode
   * @param {Pick<import('../../src/llm/LlmClient.js').LlmClient, 'complete'>} [options.inner] required in record mode
   * @param {(role: string) => string} [options.modelFor] model ID stored with each recording
   */
  constructor({ dir, mode, inner, modelFor }) {
    if (mode === 'record' && !inner) throw new LlmError('record mode needs an inner LlmClient');
    this.#dir = dir;
    this.#mode = mode;
    this.#inner = inner;
    this.#modelFor = modelFor ?? (() => 'unknown');
  }

  /** @param {string} caseId `<set>/<name>` */
  beginCase(caseId) {
    const [set, name] = caseId.split('/');
    const cases = this.#load(set);
    if (this.#mode === 'record') {
      cases[name] = { recordedAt: new Date().toISOString(), calls: [] };
      this.#dirtySets.add(set);
    }
    this.#current = { set, name, served: new Map() };
  }

  /** Same contract as LlmClient#complete. */
  async complete({ role, system, user, schema }) {
    if (!this.#current) throw new LlmError('FixtureLlmClient: call beginCase() first');
    return this.#mode === 'record'
      ? this.#record(role, { role, system, user, schema })
      : this.#replay(role, schema);
  }

  /** Case IDs that had no recording for at least one call (replay mode). */
  get missing() {
    return [...new Set(this.#missing)];
  }

  /** Writes every set touched in record mode; existing cases not re-run are kept. */
  save() {
    mkdirSync(this.#dir, { recursive: true });
    for (const set of this.#dirtySets) {
      const cases = this.#sets.get(set);
      const sorted = Object.fromEntries(
        Object.keys(cases)
          .sort()
          .map((key) => [key, cases[key]]),
      );
      writeFileSync(this.#file(set), `${JSON.stringify(sorted, null, 2)}\n`);
    }
    this.#dirtySets.clear();
  }

  async #record(role, request) {
    const { set, name } = this.#current;
    const entry = { role, model: this.#modelFor(role) };
    this.#sets.get(set)[name].calls.push(entry);
    try {
      entry.output = await this.#inner.complete(request);
      return entry.output;
    } catch (error) {
      entry.error = error.name;
      throw error;
    }
  }

  #replay(role, schema) {
    const { set, name, served } = this.#current;
    const calls = this.#sets.get(set)[name]?.calls.filter((call) => call.role === role) ?? [];
    const index = served.get(role) ?? 0;
    served.set(role, index + 1);
    const call = calls[index];
    if (!call) {
      this.#missing.push(`${set}/${name}`);
      throw new LlmError(`No recorded ${role} output for ${set}/${name}`);
    }
    if (call.error) throw new LlmError(`Recorded ${role} failure: ${call.error}`);
    const parsed = schema.safeParse(call.output);
    if (!parsed.success) {
      throw new LlmOutputError(`Recorded ${role} output for ${set}/${name} fails the schema`);
    }
    return parsed.data;
  }

  #load(set) {
    if (!this.#sets.has(set)) {
      let cases = {};
      try {
        cases = JSON.parse(readFileSync(this.#file(set), 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      this.#sets.set(set, cases);
    }
    return this.#sets.get(set);
  }

  #file(set) {
    return join(this.#dir, `${set}.json`);
  }
}

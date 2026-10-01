/** Reported in place of a signal that crashed, so the Risk Engine can fail closed. */
const SIGNAL_ERROR = { id: 'S0', name: 'SIGNAL_ERROR', severity: 'high' };

/** Layer 2: runs every signal on one email and collects the ones that fire. */
export class SignalEngine {
  #signals;
  #logger;

  /**
   * @param {{ signals: import('./Signal.js').Signal[], logger: import('../../core/Logger.js').Logger }} deps
   */
  constructor({ signals, logger }) {
    this.#signals = signals;
    this.#logger = logger;
  }

  /**
   * @param {import('../ingest/EmailIngestor.js').IngestedEmail} email
   * @param {import('./Signal.js').SignalContext} context
   * @returns {import('./Signal.js').SignalResult[]}
   */
  evaluate(email, context) {
    const results = [];
    for (const signal of this.#signals) {
      try {
        const result = signal.evaluate(email, context);
        if (result) results.push(result);
      } catch (error) {
        // One broken check must not silently drop evidence: the error itself becomes a finding.
        this.#logger.error('Signal failed', { signal: signal.name, error: error.message });
        results.push({ ...SIGNAL_ERROR, reason: `Safety check ${signal.name} could not run.` });
      }
    }
    return results;
  }
}

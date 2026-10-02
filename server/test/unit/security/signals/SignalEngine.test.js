import { describe, expect, it } from 'vitest';
import { Logger } from '../../../../src/core/Logger.js';
import { Signal } from '../../../../src/security/signals/Signal.js';
import { SignalEngine } from '../../../../src/security/signals/SignalEngine.js';
import { ingestedEmail, signalContext } from './fixtures.js';

class AlwaysFires extends Signal {
  constructor() {
    super({ id: 'T1', name: 'ALWAYS', severity: 'low' });
  }
  evaluate() {
    return this.fire('always');
  }
}

class NeverFires extends Signal {
  constructor() {
    super({ id: 'T2', name: 'NEVER', severity: 'low' });
  }
  evaluate() {
    return null;
  }
}

class Crashes extends Signal {
  constructor() {
    super({ id: 'T3', name: 'CRASHES', severity: 'low' });
  }
  evaluate() {
    throw new Error('boom');
  }
}

function engine(signals) {
  const lines = [];
  const logger = new Logger({ level: 'error', sink: (line) => lines.push(JSON.parse(line)) });
  return { engine: new SignalEngine({ signals, logger }), lines };
}

describe('SignalEngine', () => {
  it('returns only the signals that fire', () => {
    const { engine: subject } = engine([new AlwaysFires(), new NeverFires()]);
    expect(subject.evaluate(ingestedEmail(), signalContext())).toEqual([
      { id: 'T1', name: 'ALWAYS', severity: 'low', reason: 'always' },
    ]);
  });

  it('turns a crashing signal into a high-severity finding and keeps the others', () => {
    const { engine: subject, lines } = engine([new Crashes(), new AlwaysFires()]);
    const results = subject.evaluate(ingestedEmail(), signalContext());
    expect(results.map((result) => result.name)).toEqual(['SIGNAL_ERROR', 'ALWAYS']);
    expect(results[0]).toMatchObject({ id: 'S0', severity: 'high' });
    expect(lines[0]).toMatchObject({ level: 'error', signal: 'CRASHES' });
  });

  it('requires subclasses to implement evaluate', () => {
    const bare = new Signal({ id: 'X', name: 'X', severity: 'low' });
    expect(() => bare.evaluate(ingestedEmail(), signalContext())).toThrow(/must implement/);
  });
});

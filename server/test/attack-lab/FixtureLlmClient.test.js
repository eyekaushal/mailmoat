import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { LlmError, LlmOutputError, LlmRefusalError } from '../../src/core/errors.js';
import { FixtureLlmClient } from './FixtureLlmClient.js';

const schema = z.strictObject({ category: z.string() });
const request = { role: 'reader', system: 'sys', user: 'untrusted text', schema };
const dir = () => mkdtempSync(join(tmpdir(), 'mailmoat-fixtures-'));

describe('FixtureLlmClient', () => {
  it('replays recorded output per case and role, validated against the schema', async () => {
    const fixtures = dir();
    writeFileSync(
      join(fixtures, 'bec.json'),
      JSON.stringify({
        'ceo-fraud': {
          recordedAt: null,
          calls: [
            { role: 'reader', model: 'x', output: { category: 'work' } },
            { role: 'reader', model: 'x', output: { category: 'bogus', extra: 1 } },
          ],
        },
      }),
    );
    const client = new FixtureLlmClient({ dir: fixtures, mode: 'replay' });
    client.beginCase('bec/ceo-fraud');
    expect(await client.complete(request)).toEqual({ category: 'work' });
    await expect(client.complete(request)).rejects.toBeInstanceOf(LlmOutputError);
    await expect(client.complete(request)).rejects.toBeInstanceOf(LlmError);
    expect(client.missing).toEqual(['bec/ceo-fraud']);
  });

  it('fails closed on a missing case or set and reports it', async () => {
    const client = new FixtureLlmClient({ dir: dir(), mode: 'replay' });
    client.beginCase('benign/receipt');
    await expect(client.complete(request)).rejects.toBeInstanceOf(LlmError);
    expect(client.missing).toEqual(['benign/receipt']);
  });

  it('refuses to answer outside a case', async () => {
    const client = new FixtureLlmClient({ dir: dir(), mode: 'replay' });
    await expect(client.complete(request)).rejects.toBeInstanceOf(LlmError);
  });

  it('records outputs and failures through the inner client, keeping untouched cases', async () => {
    const fixtures = dir();
    writeFileSync(
      join(fixtures, 'bec.json'),
      JSON.stringify({
        old: {
          recordedAt: null,
          calls: [{ role: 'reader', model: 'h', output: { category: 'x' } }],
        },
      }),
    );
    const answers = [
      () => Promise.resolve({ category: 'work' }),
      () => Promise.reject(new LlmRefusalError('declined')),
    ];
    const inner = { complete: () => answers.shift()() };
    const client = new FixtureLlmClient({
      dir: fixtures,
      mode: 'record',
      inner,
      modelFor: () => 'claude-x',
    });
    client.beginCase('bec/new');
    expect(await client.complete(request)).toEqual({ category: 'work' });
    await expect(client.complete(request)).rejects.toBeInstanceOf(LlmRefusalError);
    client.save();

    const saved = JSON.parse(readFileSync(join(fixtures, 'bec.json'), 'utf8'));
    expect(Object.keys(saved)).toEqual(['new', 'old']);
    expect(saved.new.calls).toEqual([
      { role: 'reader', model: 'claude-x', output: { category: 'work' } },
      { role: 'reader', model: 'claude-x', error: 'LlmRefusalError' },
    ]);

    // A recorded failure replays as a failure, so fail-closed behaviour is reproduced offline.
    const replay = new FixtureLlmClient({ dir: fixtures, mode: 'replay' });
    replay.beginCase('bec/new');
    await replay.complete(request);
    await expect(replay.complete(request)).rejects.toThrow('LlmRefusalError');
  });

  it('needs an inner client to record', () => {
    expect(() => new FixtureLlmClient({ dir: dir(), mode: 'record' })).toThrow(LlmError);
  });
});

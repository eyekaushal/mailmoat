import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../../src/core/errors.js';
import { ModelConfig } from '../../../src/llm/ModelConfig.js';

describe('ModelConfig', () => {
  it('uses the PRD §14 defaults', () => {
    const models = new ModelConfig();
    expect(models.forRole('reader')).toEqual({
      model: 'claude-haiku-4-5',
      maxTokens: 1024,
      effort: null,
      fallback: false,
    });
    expect(models.forRole('drafter').model).toBe('claude-haiku-4-5');
    expect(models.forRole('planner')).toEqual({
      model: 'claude-opus-5-5',
      maxTokens: 8000,
      effort: 'medium',
      fallback: true,
    });
  });

  it('accepts the documented alternatives', () => {
    const models = new ModelConfig({
      plannerModel: 'claude-sonnet-5-5',
      drafterModel: 'claude-sonnet-5-5',
    });
    expect(models.forRole('planner').model).toBe('claude-sonnet-5-5');
    expect(models.forRole('drafter')).toMatchObject({
      model: 'claude-sonnet-5-5',
      effort: 'low',
      fallback: true,
    });
  });

  it('rejects other models and unknown roles', () => {
    expect(() => new ModelConfig({ plannerModel: 'claude-haiku-4-5' })).toThrow(ConfigError);
    expect(() => new ModelConfig().forRole('admin')).toThrow(ConfigError);
  });

  it('estimates cost including cache reads and writes', () => {
    const cost = new ModelConfig().costUsd('claude-opus-5-5', {
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(4 + 2 + 0.2);
    expect(
      new ModelConfig().costUsd('claude-unknown', { input_tokens: 1, output_tokens: 1 }),
    ).toBeNull();
  });
});

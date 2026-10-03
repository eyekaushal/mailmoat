import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConfigError, ToolError } from '../../../../src/core/errors.js';
import { Tool } from '../../../../src/agent/tools/Tool.js';
import { ToolRegistry } from '../../../../src/agent/tools/ToolRegistry.js';
import { ArchiveTool } from '../../../../src/agent/tools/ArchiveTool.js';
import { SearchEmailsTool } from '../../../../src/agent/tools/SearchEmailsTool.js';
import { Planner } from '../../../../src/agent/Planner.js';
import { Logger } from '../../../../src/core/Logger.js';

class DemoTool extends Tool {
  constructor() {
    super({
      name: 'archive',
      description: 'Demo.',
      args: z.strictObject({
        id: z.string().min(1).describe('An id.'),
        tags: z.array(z.string()).optional().describe('Tags.'),
        mode: z.enum(['a', 'b']).optional().describe('Mode.'),
        count: z.int().optional().describe('Count.'),
      }),
    });
  }
}

describe('Tool', () => {
  it('describes its arguments for the Planner catalogue', () => {
    expect(new DemoTool().describe()).toEqual({
      name: 'archive',
      description: 'Demo.',
      args: [
        { name: 'id', type: 'string', description: 'An id.', required: true },
        { name: 'tags', type: 'list of string', description: 'Tags.', required: false },
        { name: 'mode', type: 'one of "a", "b"', description: 'Mode.', required: false },
        { name: 'count', type: 'integer', description: 'Count.', required: false },
      ],
    });
  });

  it('rejects invalid arguments naming only the path', () => {
    const tool = new DemoTool();
    expect(tool.parseArgs({ id: 'x' })).toEqual({ id: 'x' });
    expect(() => tool.parseArgs({ id: 'x', extra: 'secret-value' })).toThrow(ToolError);
    expect(() => tool.parseArgs({ id: '' })).toThrow(/Invalid arguments for archive: id/);
    expect(() => tool.parseArgs({ id: 'x', count: 'secret-value' })).toThrow(/count$/);
  });

  it('cannot run until a subclass implements execute', async () => {
    const bare = new Tool({ name: 'archive', description: 'x', args: z.strictObject({}) });
    await expect(bare.execute({}, {})).rejects.toThrow(ToolError);
  });
});

describe('ToolRegistry', () => {
  const gmail = { archive: async () => {} };
  const repos = {
    emails: { search: () => [] },
    verdicts: { get: () => undefined, readerForm: () => undefined },
  };

  it('looks tools up by name and lists them', () => {
    const registry = new ToolRegistry([new ArchiveTool({ gmail }), new SearchEmailsTool(repos)]);
    expect(registry.names()).toEqual(['archive', 'search_emails']);
    expect(registry.get('archive')).toBeInstanceOf(ArchiveTool);
    expect(() => registry.get('forward')).toThrow(ToolError);
  });

  it('refuses tools outside the v1 set and duplicates', () => {
    const rogue = new Tool({ name: 'forward', description: 'x', args: z.strictObject({}) });
    expect(() => new ToolRegistry([rogue])).toThrow(ConfigError);
    expect(
      () => new ToolRegistry([new ArchiveTool({ gmail }), new ArchiveTool({ gmail })]),
    ).toThrow(ConfigError);
  });

  it('produces a catalogue the Planner accepts', () => {
    const registry = new ToolRegistry([new ArchiveTool({ gmail }), new SearchEmailsTool(repos)]);
    const logger = new Logger({ level: 'error', sink: () => {} });
    const planner = new Planner({
      llm: {},
      tools: registry.catalogue(),
      auditLog: { record() {} },
      logger,
    });
    expect(planner).toBeInstanceOf(Planner);
  });
});

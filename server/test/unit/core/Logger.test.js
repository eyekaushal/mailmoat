import { describe, expect, it } from 'vitest';
import { Logger } from '../../../src/core/Logger.js';

function capture(level) {
  const lines = [];
  const logger = new Logger({
    level,
    sink: (line) => lines.push(JSON.parse(line)),
    now: () => new Date('2026-10-01T00:00:00Z'),
  });
  return { logger, lines };
}

describe('Logger', () => {
  it('writes structured entries with context', () => {
    const { logger, lines } = capture('info');
    logger.child({ module: 'sync' }).info('polled', { newMessages: 3 });
    expect(lines).toEqual([
      {
        time: '2026-10-01T00:00:00.000Z',
        level: 'info',
        message: 'polled',
        module: 'sync',
        newMessages: 3,
      },
    ]);
  });

  it('drops entries below the configured level', () => {
    const { logger, lines } = capture('warn');
    logger.info('ignored');
    logger.warn('kept');
    expect(lines.map((l) => l.message)).toEqual(['kept']);
  });

  it('always redacts secrets, even at debug level', () => {
    const { logger, lines } = capture('debug');
    logger.debug('auth', {
      refreshToken: 'abc',
      apiKey: 'sk-ant-x',
      nested: { client_secret: 'y' },
    });
    expect(lines[0]).toMatchObject({
      refreshToken: '[redacted]',
      apiKey: '[redacted]',
      nested: { client_secret: '[redacted]' },
    });
  });

  it('redacts email content and addresses at info level', () => {
    const { logger, lines } = capture('info');
    logger.info('email', {
      subject: 'Invoice',
      fromAddress: 'a@b.com',
      to: ['c@d.com'],
      gmailId: 'm1',
    });
    expect(lines[0]).toMatchObject({
      subject: '[redacted]',
      fromAddress: '[redacted]',
      to: '[redacted]',
      gmailId: 'm1',
    });
  });

  it('shows email fields only when debug is explicitly enabled', () => {
    const { logger, lines } = capture('debug');
    logger.debug('email', { subject: 'Invoice' });
    expect(lines[0].subject).toBe('Invoice');
  });

  it('does not mistake token counts for secrets', () => {
    const { logger, lines } = capture('info');
    logger.info('llm call', { inputTokens: 1500, outputTokens: 300 });
    expect(lines[0]).toMatchObject({ inputTokens: 1500, outputTokens: 300 });
  });

  it('logs errors by name and message only', () => {
    const { logger, lines } = capture('info');
    logger.error('failed', { error: new TypeError('boom') });
    expect(lines[0].error).toEqual({ name: 'TypeError', message: 'boom' });
  });
});

import { describe, expect, it } from 'vitest';
import { Config } from '../../../src/config/Config.js';
import { ConfigError } from '../../../src/core/errors.js';

const mac = { platform: 'darwin', homedir: '/Users/k' };

describe('Config', () => {
  it('uses safe defaults', () => {
    const config = new Config({}, mac);
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4747);
    expect(config.logLevel).toBe('info');
    expect(config.anthropicApiKey).toBeUndefined();
    expect(config.googleClient).toBeUndefined();
  });

  it('always binds to loopback, whatever the environment says', () => {
    expect(new Config({ HOST: '0.0.0.0' }, mac).host).toBe('127.0.0.1');
  });

  it('places data outside the repository, per operating system', () => {
    expect(new Config({}, mac).dataDir).toBe('/Users/k/Library/Application Support/mailmoat');
    expect(new Config({}, { platform: 'linux', homedir: '/home/k' }).dataDir).toBe(
      '/home/k/.local/share/mailmoat',
    );
    expect(new Config({ MAILMOAT_DATA_DIR: '/tmp/mm' }, mac).databasePath).toBe(
      '/tmp/mm/mailmoat.db',
    );
  });

  it('reads keys and the Google client, treating blank values as missing', () => {
    const config = new Config(
      { ANTHROPIC_API_KEY: ' sk-ant-1 ', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: '' },
      mac,
    );
    expect(config.anthropicApiKey).toBe('sk-ant-1');
    expect(config.googleClient).toBeUndefined();
  });

  it('rejects invalid values with a clear error', () => {
    expect(() => new Config({ PORT: '80' }, mac)).toThrow(ConfigError);
    expect(() => new Config({ LOG_LEVEL: 'verbose' }, mac)).toThrow(/LOG_LEVEL/);
  });
});

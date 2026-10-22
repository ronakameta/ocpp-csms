import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

// The smallest environment that passes: only the required variables.
const validEnv = {
  DATABASE_URL: 'postgres://csms:csms@localhost:5432/csms',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadConfig', () => {
  it('applies defaults when optional variables are missing', () => {
    const config = loadConfig(validEnv);

    expect(config).toEqual({
      nodeEnv: 'development',
      host: '0.0.0.0',
      port: 3000,
      logLevel: 'info',
      databaseUrl: validEnv.DATABASE_URL,
      redisUrl: validEnv.REDIS_URL,
    });
  });

  it('converts PORT from a string to a number', () => {
    const config = loadConfig({ ...validEnv, PORT: '8080' });
    expect(config.port).toBe(8080);
  });

  it('fails when a required variable is missing', () => {
    expect(() => loadConfig({ REDIS_URL: validEnv.REDIS_URL })).toThrow(/DATABASE_URL/);
  });

  it.each(['abc', '', '0', '70000'])('rejects PORT=%j', (port) => {
    expect(() => loadConfig({ ...validEnv, PORT: port })).toThrow(/PORT/);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => loadConfig({ ...validEnv, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('reports every problem at once, not just the first', () => {
    try {
      loadConfig({ PORT: 'abc' });
      expect.unreachable('loadConfig should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const problems = (err as ConfigError).problems.join('\n');
      expect(problems).toMatch(/PORT/);
      expect(problems).toMatch(/DATABASE_URL/);
      expect(problems).toMatch(/REDIS_URL/);
    }
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(loadConfig(validEnv))).toBe(true);
  });
});

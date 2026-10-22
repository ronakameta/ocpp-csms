import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // src/shared/config.ts validates process.env as soon as it is imported,
    // so tests need a valid environment. These values are never used to connect.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgres://csms:csms@localhost:5432/csms_test',
      REDIS_URL: 'redis://localhost:6379',
    },
  },
});

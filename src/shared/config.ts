// Application config, read from environment variables.
// This is the ONLY file allowed to read process.env (ESLint enforces it).
// Everything else imports `config` from here and gets typed, validated values.

import { z } from 'zod';

// 1. The schema: what each variable must look like.
//
// Environment variables always arrive as strings (or are missing), so the schema
// also converts them: `z.coerce.number()` turns "3000" into 3000.
// `.default(x)` makes a variable optional; anything without a default is required.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  HOST: z.string().min(1).default('0.0.0.0'),

  // Number("") is 0, so PORT="" becomes 0 and fails .min(1) with a clear error
  // instead of silently starting on a random port.
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  LOG_LEVEL: z.enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // No defaults: there is no safe value to guess for these, so they are required.
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
});

// 2. The shape the rest of the app sees.
//
// z.infer reads the schema and produces the TypeScript type for us, so the type
// and the runtime check can never drift apart. We then rename to camelCase,
// because that is the convention inside TypeScript code.
type Env = z.infer<typeof envSchema>;

export type Config = Readonly<{
  nodeEnv: Env['NODE_ENV'];
  host: string;
  port: number;
  logLevel: Env['LOG_LEVEL'];
  databaseUrl: string;
  redisUrl: string;
}>;

// A dedicated error type, so callers can tell "bad config" apart from any other crash.
export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

// 3. loadConfig: validate an environment and return the config, or throw.
//
// It takes `env` as a parameter instead of reading process.env itself.
// That is what makes it testable: tests pass in a fake environment.
// It throws instead of exiting, so a test can check the error without
// killing the test runner.
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  // safeParse never throws. It returns { success: true, data } or
  // { success: false, error }, and the error lists EVERY problem, not just the first.
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new ConfigError(problems);
  }

  const e = result.data;

  // Object.freeze stops any code from changing config at runtime by accident.
  return Object.freeze({
    nodeEnv: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
  });
}

// 4. The one place that touches the real environment.
//
// On bad config we print every problem and exit with code 1 (fail fast).
// We use console.error, not the logger, because the logger itself needs
// config to start (logger.ts imports this file).
function loadConfigOrExit(): Config {
  try {
    return loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

export const config = loadConfigOrExit();

import type { LoggerOptions } from 'pino';
import { config } from './config.js';

export const loggerOptions: LoggerOptions = {
  level: config.logLevel,
  redact: {
    paths: ['password', '*.password', 'token', '*.token', 'req.headers.authorization'],
    censor: '[redacted]',
  },
};

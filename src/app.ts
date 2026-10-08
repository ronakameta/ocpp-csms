import Fastify, { type FastifyServerOptions } from 'fastify';
import { loggerOptions } from './shared/logger.js';

export function buildApp(opts: FastifyServerOptions = { logger: loggerOptions }) {
  const app = Fastify(opts);

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

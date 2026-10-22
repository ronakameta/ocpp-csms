import { buildApp } from './app.js';
import { config, configWarnings } from './shared/config.js';

const app = buildApp();

for (const warning of configWarnings(config)) {
  app.log.warn(warning);
}

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

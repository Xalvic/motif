import { serve } from '@hono/node-server';
import { createApp } from './app';
import { ConfigError, loadConfig, type Config } from './config';
import { createLogger } from './log';

let config: Config;
try {
  config = loadConfig(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(`Server config error (see apps/server/.env.example):\n${error.message}`);
  process.exit(1);
}

const logger = createLogger(config);
const app = createApp({ config, logger });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  logger.info({ port: info.port, inviteCodes: config.inviteCodes.length }, 'server listening');
});

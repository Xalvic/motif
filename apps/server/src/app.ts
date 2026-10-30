import { Hono } from 'hono';
import { requestId } from 'hono/request-id';
import type { Logger } from 'pino';
import type { ApiError } from '@motif/protocol/errors';
import type { HealthResponse } from '@motif/protocol/health';
import type { MeResponse } from '@motif/protocol/me';
import pkg from '../package.json' with { type: 'json' };
import { requireInvite } from './auth';
import type { Config } from './config';
import type { AppEnv } from './context';
import { requestLog } from './log';

/** The whole HTTP app, with no port and no env access, so tests can call `app.request()`. */
export function createApp({ config, logger }: { config: Config; logger: Logger }) {
  const app = new Hono<AppEnv>();

  app.use(requestId());
  app.use(requestLog(logger));

  app.get('/api/health', (c) =>
    c.json({ ok: true, version: pkg.version } satisfies HealthResponse),
  );

  app.get('/api/me', requireInvite(config.inviteCodes), (c) =>
    c.json({ name: c.get('codeName') } satisfies MeResponse),
  );

  app.notFound((c) =>
    c.json({ error: { code: 'not_found', message: 'No such route.' } } satisfies ApiError, 404),
  );

  // The reply never carries the stack; the log line does.
  app.onError((err, c) => {
    logger.error({ reqId: c.get('requestId'), err }, 'unhandled error');
    return c.json(
      { error: { code: 'internal', message: 'Server error.' } } satisfies ApiError,
      500,
    );
  });

  return app;
}

import { pino, type DestinationStream, type Logger } from 'pino';
import type { MiddlewareHandler } from 'hono';
import type { Config } from './config';
import type { AppEnv } from './context';

/**
 * JSON lines, or pretty lines when `LOG_PRETTY=1` (dev). Tests pass a `destination` to read
 * the lines. No code path logs the Authorization header; `redact` is a second guard.
 */
export function createLogger(
  config: Pick<Config, 'logLevel' | 'logPretty'>,
  destination?: DestinationStream,
): Logger {
  const options = {
    level: config.logLevel,
    redact: {
      paths: ['authorization', '*.authorization', '*.headers.authorization'],
      censor: '[redacted]',
    },
  };
  if (destination) return pino(options, destination);
  if (config.logPretty) {
    return pino({
      ...options,
      transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } },
    });
  }
  return pino(options);
}

/** One log line per request, written after the reply is ready. */
export function requestLog(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const start = performance.now();
    await next();
    const status = c.res.status;
    const line = {
      reqId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status,
      ms: Math.round(performance.now() - start),
      codeName: c.get('codeName'),
      reason: c.get('authFailure'),
    };
    if (status >= 500) logger.error(line, 'request');
    else if (status >= 400) logger.warn(line, 'request');
    else logger.info(line, 'request');
  };
}

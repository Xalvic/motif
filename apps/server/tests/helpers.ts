import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createLogger } from '../src/log';

export const JEV = 'jev-code-0123456789abcdef';
export const MILAN = 'milan-code-ABCDEFGHIJKLMN';

/** An app with two codes and a logger that writes into `lines` instead of stdout. */
export function testApp(inviteCodes = `jev:${JEV},milan:${MILAN}`) {
  const config = loadConfig({ INVITE_CODES: inviteCodes, LOG_LEVEL: 'info' });
  const lines: string[] = [];
  const logger = createLogger(config, { write: (line: string) => void lines.push(line) });
  const app = createApp({ config, logger });
  const logs = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { app, lines, logs };
}

export const bearer = (code: string) => ({ headers: { Authorization: `Bearer ${code}` } });

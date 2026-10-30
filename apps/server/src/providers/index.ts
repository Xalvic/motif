import type { Logger } from 'pino';
import { ThinkingLevel } from '@google/genai';
import type { GeminiConfig } from '../config';
import { createFallbackCall } from './fallback';
import { createGeminiClient, createGeminiTry, type GeminiClient } from './gemini/client';
import type { CallModel } from './types';

/**
 * The one entry point for model calls: main model with LOW thinking, fallback model at its
 * default, and the 429 policy around both. `client` lets tests and scripts pass a fake.
 */
export function createCallModel(
  gemini: GeminiConfig & { apiKey: string },
  logger: Pick<Logger, 'info'>,
  client: GeminiClient = createGeminiClient(gemini.apiKey),
): CallModel {
  const { apiKey } = gemini;
  return createFallbackCall({
    main: createGeminiTry({
      client,
      apiKey,
      model: gemini.model,
      thinkingLevel: ThinkingLevel.LOW,
    }),
    fallback: createGeminiTry({ client, apiKey, model: gemini.fallbackModel }),
    log: (line) => logger.info({ modelCall: line }, 'model call'),
  });
}

import { GoogleGenAI, ThinkingLevel, type GenerateContentParameters } from '@google/genai';
import { ProviderError, type ModelTry } from '../types';
import { toProviderError } from './errors';
import { fromStream, type GeminiChunk } from './fromGemini';
import { toContents, toTools } from './toGemini';

/** The one SDK method we use. `new GoogleGenAI(...).models` has it; tests pass a fake. */
export interface GeminiClient {
  generateContentStream(params: GenerateContentParameters): Promise<AsyncIterable<GeminiChunk>>;
}

/**
 * A real client. No `retryOptions`: the SDK retry would ignore `retryDelay`, so the
 * fallback policy does the retries.
 */
export function createGeminiClient(apiKey: string): GeminiClient {
  return new GoogleGenAI({ apiKey }).models;
}

export interface GeminiTryOptions {
  client: GeminiClient;
  model: string;
  /** Leave it out to use the model's default. */
  thinkingLevel?: ThinkingLevel;
  /** Removed from every error message, as a guard. */
  apiKey?: string;
}

/** One try on one Gemini model. Throws only `ProviderError`. */
export function createGeminiTry(options: GeminiTryOptions): ModelTry {
  const { client, model, thinkingLevel, apiKey } = options;
  const redact = (error: ProviderError) =>
    apiKey && error.message.includes(apiKey)
      ? new ProviderError(error.kind, error.message.replaceAll(apiKey, '[redacted]'), error)
      : error;

  return {
    model,
    async call({ system, messages, tools, signal, onText }) {
      let sentText = false;
      try {
        const stream = await client.generateContentStream({
          model,
          contents: toContents(messages),
          config: {
            systemInstruction: system,
            ...toTools(tools),
            ...(thinkingLevel && { thinkingConfig: { thinkingLevel } }),
            ...(signal && { abortSignal: signal }),
          },
        });
        return await fromStream(stream, model, (delta) => {
          sentText = true;
          onText?.(delta);
        });
      } catch (error) {
        const failure = toProviderError(error);
        if (!sentText) throw redact(failure);
        throw redact(
          new ProviderError(failure.kind, failure.message, { ...failure, afterText: true }),
        );
      }
    },
  };
}

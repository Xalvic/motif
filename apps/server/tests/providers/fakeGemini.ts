import { readFileSync } from 'node:fs';
import { ApiError, type GenerateContentParameters } from '@google/genai';
import type { GeminiClient } from '../../src/providers/gemini/client';
import type { GeminiChunk } from '../../src/providers/gemini/fromGemini';

const dir = new URL('../fixtures/gemini/', import.meta.url);

export function streamFixture(name: string): GeminiChunk[] {
  return (
    JSON.parse(readFileSync(new URL(`${name}.json`, dir), 'utf8')) as { chunks: GeminiChunk[] }
  ).chunks;
}

type ErrorName =
  | 'rate-minute'
  | 'rate-minute-long'
  | 'rate-day'
  | 'overloaded'
  | 'bad-request'
  | 'bad-key'
  | 'forbidden';

/** The error the SDK throws for a fixture: `ApiError` with the JSON body as its message. */
export function errorFixture(name: ErrorName): ApiError {
  const all = JSON.parse(readFileSync(new URL('errors.json', dir), 'utf8')) as Record<
    string,
    { status: number; body: unknown }
  >;
  const fixture = all[name]!;
  return new ApiError({ status: fixture.status, message: JSON.stringify(fixture.body) });
}

export async function* replay(chunks: GeminiChunk[], failAfter?: Error) {
  for (const chunk of chunks) yield chunk;
  if (failAfter) throw failAfter;
}

/** A client that answers each call with the next item: a list of chunks or an error. */
export function fakeClient(...answers: (GeminiChunk[] | Error)[]) {
  const calls: GenerateContentParameters[] = [];
  const client: GeminiClient = {
    async generateContentStream(params) {
      calls.push(params);
      const answer = answers.shift();
      if (answer === undefined) throw new Error('fakeClient: no answer left');
      if (answer instanceof Error) throw answer;
      return replay(answer);
    },
  };
  return { client, calls };
}

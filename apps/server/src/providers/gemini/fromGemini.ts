import type { GenerateContentResponse, Part as GeminiPart } from '@google/genai';
import type { ModelResult, Part, ToolCallPart } from '../types';
import { LOCAL_ID_PREFIX } from './toGemini';

/** The fields of a stream chunk that we read. A recorded fixture is a list of these. */
export type GeminiChunk = Pick<
  GenerateContentResponse,
  'candidates' | 'usageMetadata' | 'promptFeedback'
>;

/**
 * Reads a `generateContentStream` reply into one result. Every raw part goes into `native`
 * unchanged: a thought signature can come on any part, also on a later chunk with empty text.
 */
export async function fromStream(
  stream: AsyncIterable<GeminiChunk>,
  model: string,
  onText?: (delta: string) => void,
): Promise<ModelResult> {
  const native: GeminiPart[] = [];
  const toolCalls: ToolCallPart[] = [];
  let text = '';
  let finishReason = '';
  let usage = { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 };

  for await (const chunk of stream) {
    const candidate = chunk.candidates?.[0];
    for (const part of candidate?.content?.parts ?? []) {
      native.push(part);
      if (part.text && !part.thought) {
        text += part.text;
        onText?.(part.text);
      }
      if (part.functionCall) {
        const { id, name, args } = part.functionCall;
        toolCalls.push({
          kind: 'toolCall',
          id: id ?? `${LOCAL_ID_PREFIX}${toolCalls.length + 1}`,
          name: name ?? '',
          args: args ?? {},
        });
      }
    }
    if (candidate?.finishReason) finishReason = candidate.finishReason;
    const blocked = chunk.promptFeedback?.blockReason;
    if (blocked) finishReason = `BLOCKED_${blocked}`;
    const meta = chunk.usageMetadata;
    if (meta) {
      usage = {
        inputTokens: meta.promptTokenCount ?? 0,
        outputTokens: meta.candidatesTokenCount ?? 0,
        thoughtTokens: meta.thoughtsTokenCount ?? 0,
      };
    }
  }

  const parts: Part[] = [...(text ? [{ kind: 'text' as const, text }] : []), ...toolCalls];
  return {
    message: { role: 'model', parts, native },
    toolCalls,
    text,
    model,
    usage,
    finishReason,
  };
}

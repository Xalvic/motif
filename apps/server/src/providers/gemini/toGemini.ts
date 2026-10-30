import {
  FunctionCallingConfigMode,
  type Content,
  type Part as GeminiPart,
  type Tool,
  type ToolConfig,
} from '@google/genai';
import type { Message, ToolSpec } from '../types';

/** Ids that `fromGemini` made because the model sent none. Gemini never sees them. */
export const LOCAL_ID_PREFIX = 'local-';

function idField(id: string): { id?: string } {
  return id.startsWith(LOCAL_ID_PREFIX) ? {} : { id };
}

/**
 * Neutral messages → Gemini `contents`. A model message with `native` goes out exactly as
 * Gemini sent it, so its thought signatures stay in place. Tool results keep the order of
 * their parts, which is the order of the calls.
 */
export function toContents(messages: Message[]): Content[] {
  return messages.map((message) => {
    if (message.role === 'model' && Array.isArray(message.native)) {
      return { role: 'model', parts: message.native as GeminiPart[] };
    }
    const parts = message.parts.map((part): GeminiPart => {
      switch (part.kind) {
        case 'text':
          return { text: part.text };
        case 'toolCall':
          return { functionCall: { ...idField(part.id), name: part.name, args: part.args } };
        case 'toolResult':
          return {
            functionResponse: { ...idField(part.id), name: part.name, response: part.result },
          };
      }
    });
    return { role: message.role, parts };
  });
}

/** Tool specs → one Gemini tool with a function declaration each. */
export function toTools(tools: ToolSpec[]): { tools?: Tool[]; toolConfig?: ToolConfig } {
  if (tools.length === 0) return {};
  return {
    tools: [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parametersJsonSchema: tool.parameters,
        })),
      },
    ],
    // D5: AUTO. A bad argument goes back to the model as a tool error (P4).
    toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
  };
}

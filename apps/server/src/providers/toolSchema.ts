import { z } from 'zod';
import type { JsonSchema } from './types';

/**
 * The JSON Schema keywords a tool schema may use. `npm run check-schemas` (2026-10-30) found
 * that both models accept all of these, and also `$schema` and `default`. A new keyword goes
 * through that check first.
 */
export const ALLOWED_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'description',
  'title',
  'enum',
  'items',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'additionalProperties',
  'anyOf',
  'const',
]);

/**
 * Accepted by Gemini, but left out: `$schema` is noise for the model, and a default belongs
 * in the field's `.describe()` text, where the model reads it.
 */
const DROPPED = new Set(['$schema', 'default']);

/** Zod's `z.int()` writes this `maximum`. It says nothing useful to the model. */
const SAFE_INT = Number.MAX_SAFE_INTEGER;

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (typeof node !== 'object' || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED.has(key)) continue;
    if ((key === 'maximum' && value === SAFE_INT) || (key === 'minimum' && value === -SAFE_INT)) {
      continue;
    }
    // `properties` maps names to schemas: clean each schema, keep each name.
    out[key] =
      key === 'properties' && typeof value === 'object' && value !== null
        ? Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, clean(schema)]))
        : clean(value);
  }
  return out;
}

/** The keywords in a schema that are not in `ALLOWED_KEYWORDS`. Property names do not count. */
export function unknownKeywords(schema: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object' || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      if (!ALLOWED_KEYWORDS.has(key)) found.add(key);
      if (key === 'properties' && typeof value === 'object' && value !== null) {
        Object.values(value).forEach(walk);
      } else if (key !== 'enum') {
        walk(value);
      }
    }
  };
  walk(schema);
  return [...found].sort();
}

/**
 * A Zod object → the JSON Schema for a Gemini `parametersJsonSchema`. Uses the input side of
 * the schema, so a field with `.default()` is optional for the model.
 */
export function toToolSchema(schema: z.ZodObject): JsonSchema {
  return clean(z.toJSONSchema(schema, { io: 'input' })) as JsonSchema;
}

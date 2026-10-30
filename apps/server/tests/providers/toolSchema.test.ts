import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toToolSchema, unknownKeywords } from '../../src/providers/toolSchema';

/** Close to the P4 `generate_idea` and `change_chord` tools, to test the conversion. */
const GenerateIdea = z.object({
  genre: z.enum(['pop', 'lofi', 'metal']).optional().describe('Genre id'),
  bars: z.int().min(2).max(8).optional(),
  bpm: z.number().min(40).max(220).optional(),
  constraints: z
    .object({ endsOn: z.enum(['major', 'minor']).optional(), endsOnTonic: z.boolean().optional() })
    .optional(),
  keepLocks: z.boolean().default(true),
});
const ChangeChord = z.object({
  bar: z.int().min(1),
  change: z.union([z.object({ roman: z.string() }), z.object({ reroll: z.literal(true) })]),
});

describe('toToolSchema', () => {
  it('keeps types, enums, ranges and descriptions, and drops $schema and default', () => {
    expect(toToolSchema(GenerateIdea)).toEqual({
      type: 'object',
      properties: {
        genre: { description: 'Genre id', type: 'string', enum: ['pop', 'lofi', 'metal'] },
        bars: { type: 'integer', minimum: 2, maximum: 8 },
        bpm: { type: 'number', minimum: 40, maximum: 220 },
        constraints: {
          type: 'object',
          properties: {
            endsOn: { type: 'string', enum: ['major', 'minor'] },
            endsOnTonic: { type: 'boolean' },
          },
        },
        keepLocks: { type: 'boolean' },
      },
    });
  });

  it('drops the safe-integer maximum of z.int() and keeps const', () => {
    const schema = toToolSchema(ChangeChord) as { properties: Record<string, unknown> };
    expect(schema.properties.bar).toEqual({ type: 'integer', minimum: 1 });
    expect(JSON.stringify(schema)).toContain('"reroll":{"type":"boolean","const":true}');
    expect(schema).toMatchObject({ required: ['bar', 'change'] });
  });

  it('keeps a property whose name is a dropped keyword', () => {
    const schema = toToolSchema(z.object({ default: z.string() })) as { properties: object };
    expect(Object.keys(schema.properties)).toEqual(['default']);
  });

  it('gives an empty object schema for a tool with no parameters', () => {
    expect(toToolSchema(z.object({}))).toEqual({ type: 'object', properties: {} });
  });

  it('uses only allowed keywords', () => {
    for (const schema of [GenerateIdea, ChangeChord, z.object({})]) {
      expect(unknownKeywords(toToolSchema(schema))).toEqual([]);
    }
  });
});

describe('unknownKeywords', () => {
  it('finds keywords at any depth, but not property names or enum values', () => {
    const raw = z.toJSONSchema(ChangeChord, { io: 'input' });
    expect(unknownKeywords(raw)).toEqual(['$schema']);
    expect(
      unknownKeywords({
        type: 'object',
        properties: { format: { type: 'string', enum: ['$ref'] } },
      }),
    ).toEqual([]);
  });
});

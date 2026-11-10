import { describe, expect, test } from 'vitest';
import { diffOpenApiObjects } from './differ.js';

type Schema = Record<string, unknown>;
type Direction = 'request' | 'response';

function spec(direction: Direction, schema: Schema): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: { title: 'Optional property compatibility', version: '1.0.0' },
    paths: {
      '/tasks': {
        post: {
          ...(direction === 'request'
            ? { requestBody: { content: { 'application/json': { schema } } } }
            : {}),
          responses: {
            200: {
              description: 'Success',
              ...(direction === 'response' ? { content: { 'application/json': { schema } } } : {}),
            },
          },
        },
      },
    },
  };
}

function objectWith(properties: Record<string, Schema>, closed = false): Schema {
  return {
    type: 'object',
    properties,
    ...(closed ? { additionalProperties: false } : {}),
  };
}

function taskResponse(includeProgress: boolean): Schema {
  return {
    type: 'object',
    properties: {
      task: objectWith(
        includeProgress ? { progress: objectWith({ bytes_done: { type: 'integer' } }) } : {},
        true
      ),
    },
  };
}

describe('OpenAPI optional-property compatibility with additionalProperties', () => {
  test.each([
    {
      name: 'response addition to a closed parent breaks old response validation',
      direction: 'response' as const,
      oldSchema: taskResponse(false),
      newSchema: taskResponse(true),
      // { task: { progress: { bytes_done: 0 } } } is new-valid but old-invalid.
      severity: 'breaking',
      suggestedBump: 'major',
    },
    {
      name: 'request optional boolean constrains a previously unrestricted property',
      direction: 'request' as const,
      oldSchema: objectWith({}),
      newSchema: objectWith({ zdr: { type: 'boolean' } }),
      // { zdr: "previously-valid-string" } is old-valid but new-invalid.
      severity: 'breaking',
      suggestedBump: 'major',
    },
    {
      name: 'request optional enum constrains a previously unrestricted property',
      direction: 'request' as const,
      oldSchema: objectWith({}),
      newSchema: objectWith({ media_extractor: { type: 'string', enum: ['yt-dlp'] } }),
      // { media_extractor: "another-extractor" } is old-valid but new-invalid.
      severity: 'breaking',
      suggestedBump: 'major',
    },
    {
      name: 'response addition to an open parent remains compatible',
      direction: 'response' as const,
      oldSchema: objectWith({}),
      newSchema: objectWith({ progress: { type: 'integer' } }),
      severity: 'non-breaking',
      suggestedBump: 'minor',
    },
    {
      name: 'request optional addition to a closed parent remains compatible',
      direction: 'request' as const,
      oldSchema: objectWith({}, true),
      newSchema: objectWith({ zdr: { type: 'boolean' } }, true),
      severity: 'non-breaking',
      suggestedBump: 'minor',
    },
  ])('$name', ({ direction, oldSchema, newSchema, severity, suggestedBump }) => {
    const result = diffOpenApiObjects(spec(direction, oldSchema), spec(direction, newSchema));

    expect(result.changes).toEqual([
      expect.objectContaining({ category: 'property-added', severity }),
    ]);
    expect(result.suggestedBump).toBe(suggestedBump);
  });
});

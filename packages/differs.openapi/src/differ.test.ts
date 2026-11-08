import { describe, expect, test } from 'vitest';
import { diffOpenApiObjects } from './differ.js';
import { diffStructural } from './structural.js';

type SchemaDirection = 'request' | 'response';

function openApiSpec(
  direction: SchemaDirection,
  goalsRequired: boolean,
  idConstraint: Record<string, unknown> = {}
): Record<string, unknown> {
  const schema = {
    type: 'object',
    properties: {
      id: { type: 'string', ...idConstraint },
      goals: { type: 'array', items: { type: 'string' } },
    },
    required: goalsRequired ? ['id', 'goals'] : ['id'],
  };

  return {
    openapi: '3.1.0',
    info: { title: 'Direction API', version: '1.0.0' },
    paths: {
      '/agents': {
        post: {
          ...(direction === 'request'
            ? {
                requestBody: {
                  content: { 'application/json': { schema } },
                },
              }
            : {}),
          responses: {
            200:
              direction === 'response'
                ? { content: { 'application/json': { schema } } }
                : { description: 'Created' },
          },
        },
      },
    },
  };
}

describe('OpenAPI required-property compatibility direction', () => {
  test.each([
    {
      direction: 'request' as const,
      oldRequired: true,
      newRequired: false,
      category: 'required-removed',
      severity: 'non-breaking',
      suggestedBump: 'minor',
    },
    {
      direction: 'request' as const,
      oldRequired: false,
      newRequired: true,
      category: 'required-added',
      severity: 'breaking',
      suggestedBump: 'major',
    },
    {
      direction: 'response' as const,
      oldRequired: true,
      newRequired: false,
      category: 'required-removed',
      severity: 'breaking',
      suggestedBump: 'major',
    },
    {
      direction: 'response' as const,
      oldRequired: false,
      newRequired: true,
      category: 'required-added',
      severity: 'non-breaking',
      suggestedBump: 'minor',
    },
  ])(
    '$direction required $oldRequired -> $newRequired is $severity',
    ({ direction, oldRequired, newRequired, category, severity, suggestedBump }) => {
      const oldSpec = openApiSpec(direction, oldRequired);
      const newSpec = openApiSpec(direction, newRequired);

      const result = diffOpenApiObjects(oldSpec, newSpec);

      expect(result.changes).toEqual([
        expect.objectContaining({
          category,
          severity,
          ...(category === 'required-removed' ? { oldValue: 'goals' } : { newValue: 'goals' }),
        }),
      ]);
      expect(result.suggestedBump).toBe(suggestedBump);
    }
  );

  test.each([
    ['request', 'input'],
    ['response', 'output'],
  ] as const)('preserves %s schema direction as %s', (direction, schemaDirection) => {
    const changes = diffStructural(openApiSpec(direction, true), openApiSpec(direction, false));

    expect(changes).toEqual([
      expect.objectContaining({ type: 'required-removed', schemaDirection }),
    ]);
  });
});

describe('OpenAPI enum compatibility direction', () => {
  const cases = [
    {
      name: 'enum widening',
      old: { enum: ['a'] },
      next: { enum: ['a', 'b'] },
      category: 'enum-value-added',
      inputBreaking: false,
    },
    {
      name: 'enum narrowing',
      old: { enum: ['a', 'b'] },
      next: { enum: ['a'] },
      category: 'enum-value-removed',
      inputBreaking: true,
    },
    {
      name: 'enum constraint addition',
      old: {},
      next: { enum: ['a'] },
      category: 'enum-added',
      inputBreaking: true,
    },
    {
      name: 'enum constraint removal',
      old: { enum: ['a'] },
      next: {},
      category: 'enum-removed',
      inputBreaking: false,
    },
    {
      name: 'const addition',
      old: {},
      next: { const: 'a' },
      category: 'enum-added',
      inputBreaking: true,
    },
    {
      name: 'const removal',
      old: { const: 'a' },
      next: {},
      category: 'enum-removed',
      inputBreaking: false,
    },
    {
      name: 'const replacement',
      old: { const: 'a' },
      next: { const: 'b' },
      category: 'enum-value-removed',
      inputBreaking: true,
    },
    {
      name: 'null const replacement',
      old: { type: ['string', 'null'], const: 'a' },
      next: { type: ['string', 'null'], const: null },
      category: 'enum-value-removed',
      inputBreaking: true,
    },
  ];

  describe.each(['request', 'response'] as const)('%s', (direction) => {
    test.each(cases)('$name', ({ name, old, next, category, inputBreaking }) => {
      const breaking =
        name.includes('replacement') || (direction === 'request' ? inputBreaking : !inputBreaking);
      const result = diffOpenApiObjects(
        openApiSpec(direction, false, old),
        openApiSpec(direction, false, next)
      );
      expect(result.changes).toEqual([
        expect.objectContaining({ category, severity: breaking ? 'breaking' : 'non-breaking' }),
      ]);
      expect(result.suggestedBump).toBe(breaking ? 'major' : 'minor');
    });
  });
});

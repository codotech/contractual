import { describe, expect, test } from 'vitest';
import { assembleResult, deepEqual, walk } from '@contractual/differs.core';
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

describe('OpenAPI enum constraint interactions', () => {
  test.each(['request', 'response'] as const)(
    '%s const removal is retained when an enum is added',
    (direction) => {
      const oldSpec = openApiSpec(direction, false, { const: 'a' });
      const newSpec = openApiSpec(direction, false, { enum: ['a', 'b'] });
      const rawChanges = diffStructural(oldSpec, newSpec);
      expect(rawChanges).toEqual([
        expect.objectContaining({ type: 'enum-added', newValue: ['a', 'b'] }),
        expect.objectContaining({
          type: 'enum-removed',
          oldValue: 'a',
          path: expect.stringMatching(/\/const$/),
        }),
      ]);
      const result = diffOpenApiObjects(oldSpec, newSpec);
      expect(result.changes).toContainEqual(
        expect.objectContaining({
          category: direction === 'response' ? 'enum-removed' : 'enum-added',
          severity: 'breaking',
        })
      );
      expect(result.suggestedBump).toBe('major');
    }
  );

  test('enum removal does not hide a simultaneous const replacement', () => {
    const result = diffOpenApiObjects(
      openApiSpec('response', false, { enum: ['a', 'b'], const: 'a' }),
      openApiSpec('response', false, { const: 'c' })
    );
    expect(result.changes).toEqual([
      expect.objectContaining({ category: 'enum-removed', severity: 'breaking' }),
      expect.objectContaining({
        category: 'enum-value-removed',
        oldValue: 'a',
        newValue: 'c',
        severity: 'breaking',
      }),
    ]);
    expect(result.suggestedBump).toBe('major');
  });

  test.each(['request', 'response'] as const)(
    '%s enum changes inside overlapping oneOf branches require a major bump',
    (direction) => {
      const before = {
        oneOf: [
          { type: 'string', enum: ['a', 'b'] },
          { type: 'string', enum: ['b'] },
        ],
      };
      const after = {
        oneOf: [
          { type: 'string', enum: ['a'] },
          { type: 'string', enum: ['b'] },
        ],
      };
      for (const [oldSchema, newSchema] of [
        [before, after],
        [after, before],
      ]) {
        const result = diffOpenApiObjects(
          openApiSpec(direction, false, oldSchema),
          openApiSpec(direction, false, newSchema)
        );
        expect(result.changes).toEqual([
          expect.objectContaining({
            severity: 'breaking',
            path: expect.stringContaining('/oneOf/0/enum'),
          }),
        ]);
        expect(result.suggestedBump).toBe('major');
      }
    }
  );
});

test('enum removal retains a simultaneous const addition for input compatibility', () => {
  const changes = walk({ type: 'string', enum: ['a', 'b'] }, { type: 'string', const: 'a' });

  expect(changes).toEqual([
    { path: '/enum', type: 'enum-removed', oldValue: ['a', 'b'], newValue: undefined },
    { path: '/const', type: 'enum-added', oldValue: undefined, newValue: 'a' },
  ]);
  expect(assembleResult(changes, { type: 'string', const: 'a' }).suggestedBump).toBe('major');
});

describe('equivalent singleton enum and const substitutions', () => {
  test.each(['request', 'response'] as const)(
    '%s substitutions preserve the value set',
    (direction) => {
      for (const value of ['a', null, { nested: ['a'] }]) {
        const schemaType =
          value === null ? 'null' : typeof value === 'object' ? 'object' : 'string';
        const schemas = [
          { type: schemaType, enum: [value] },
          { type: schemaType, const: value },
        ];
        for (const [oldSchema, newSchema] of [schemas, [...schemas].reverse()]) {
          const oldSpec = openApiSpec(direction, false, oldSchema);
          const newSpec = openApiSpec(direction, false, newSchema);
          expect(diffStructural(oldSpec, newSpec)).toHaveLength(2);
          const result = diffOpenApiObjects(oldSpec, newSpec);
          expect(result.changes).toHaveLength(2);
          expect(result.changes.every((change) => change.severity === 'non-breaking')).toBe(true);
          expect(result.suggestedBump).toBe('minor');
          expect(assembleResult(walk(oldSchema, newSchema), newSchema).suggestedBump).toBe('minor');
        }
      }
    }
  );

  test('equivalent substitutions remain compatible inside oneOf', () => {
    const before = { oneOf: [{ const: 'a' }, { const: 'b' }] };
    const after = { oneOf: [{ enum: ['a'] }, { const: 'b' }] };
    for (const direction of ['request', 'response'] as const) {
      const result = diffOpenApiObjects(
        openApiSpec(direction, false, before),
        openApiSpec(direction, false, after)
      );
      expect(result.changes).toHaveLength(2);
      expect(result.changes.every((change) => change.severity === 'non-breaking')).toBe(true);
      expect(result.suggestedBump).toBe('minor');
    }
  });

  test('different singleton values still require a major bump', () => {
    for (const [oldSchema, newSchema] of [
      [{ const: 'a' }, { enum: ['b'] }],
      [{ enum: ['a'] }, { const: 'b' }],
    ]) {
      for (const direction of ['request', 'response'] as const) {
        expect(
          diffOpenApiObjects(
            openApiSpec(direction, false, oldSchema),
            openApiSpec(direction, false, newSchema)
          ).suggestedBump
        ).toBe('major');
      }
      expect(assembleResult(walk(oldSchema, newSchema), newSchema).suggestedBump).toBe('major');
    }
  });
});

test('parameter names cannot imitate oneOf schema paths', () => {
  function spec(values: string[]) {
    return {
      openapi: '3.1.0',
      info: { title: 'Parameters', version: '1.0.0' },
      paths: {
        '/example': {
          get: {
            parameters: [
              { in: 'query', name: 'x/oneOf/0/x~y', schema: { type: 'string', enum: values } },
            ],
            responses: { 200: { description: 'OK' } },
          },
        },
      },
    };
  }
  const result = diffOpenApiObjects(spec(['a']), spec(['a', 'b']));
  expect(result.changes).toEqual([
    expect.objectContaining({
      category: 'enum-value-added',
      severity: 'non-breaking',
      path: '/paths/~1example/get/parameters/x~1oneOf~10~1x~0y/schema/enum',
    }),
  ]);
  expect(result.suggestedBump).toBe('minor');
});

test('same-name parameters do not share equivalence evidence', () => {
  function spec(querySchema: Record<string, unknown>, headerSchema: Record<string, unknown>) {
    return {
      openapi: '3.1.0',
      info: { title: 'Parameters', version: '1.0.0' },
      paths: {
        '/example': {
          get: {
            parameters: [
              { in: 'query', name: 'x', schema: querySchema },
              { in: 'header', name: 'x', schema: headerSchema },
            ],
            responses: { 200: { description: 'OK' } },
          },
        },
      },
    };
  }
  const result = diffOpenApiObjects(spec({ enum: ['a'] }, {}), spec({}, { const: 'a' }));
  expect(result.changes).toContainEqual(
    expect.objectContaining({ category: 'enum-added', severity: 'breaking' })
  );
  expect(result.suggestedBump).toBe('major');
});

test('object const equivalence ignores key order', () => {
  const before = { const: { a: 1, b: 2 } };
  const after = { enum: [{ b: 2, a: 1 }] };
  expect(assembleResult(walk(before, after), after).suggestedBump).toBe('minor');
});

test('coexisting enum and const constraints are not treated as substitutions', () => {
  const before = { enum: ['a'], const: 'b' };
  const after = { enum: ['a'] };
  for (const change of walk(before, after)) expect(change.enumConstraintEquivalent).toBeUndefined();
  expect(
    diffOpenApiObjects(
      openApiSpec('response', false, before),
      openApiSpec('response', false, after)
    ).suggestedBump
  ).toBe('major');
});

test('arrays and objects with numeric keys are different enum values', () => {
  const before = { const: ['a'] };
  const after = { enum: [{ 0: 'a' }] };
  const changes = walk(before, after);
  expect(changes.every((change) => change.enumConstraintEquivalent === undefined)).toBe(true);
  expect(assembleResult(changes, after).suggestedBump).toBe('major');
});

test('JSON object equality requires matching own keys, including __proto__', () => {
  const ownPrototypeKey = JSON.parse('{"__proto__":{}}');
  const differentKey = JSON.parse('{"different":"value"}');
  for (const [left, right] of [
    [ownPrototypeKey, differentKey],
    [differentKey, ownPrototypeKey],
  ]) {
    expect(deepEqual(left, right)).toBe(false);
    for (const [before, after] of [
      [{ const: left }, { enum: [right] }],
      [{ enum: [left] }, { const: right }],
    ]) {
      const changes = walk(before, after);
      expect(changes.every((change) => change.enumConstraintEquivalent === undefined)).toBe(true);
      expect(assembleResult(changes, after).suggestedBump).toBe('major');
    }
  }

  const sameLeft = JSON.parse('{"__proto__":{},"nested":{"a":1,"b":[2]}}');
  const sameRight = JSON.parse('{"nested":{"b":[2],"a":1},"__proto__":{}}');
  for (const [left, right] of [
    [sameLeft, sameRight],
    [sameRight, sameLeft],
  ]) {
    expect(deepEqual(left, right)).toBe(true);
    expect(
      assembleResult(walk({ const: left }, { enum: [right] }), { enum: [right] }).suggestedBump
    ).toBe('minor');
  }
});

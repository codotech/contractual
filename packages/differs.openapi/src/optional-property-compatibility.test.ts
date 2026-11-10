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

function addingProperty(
  oldParent: Schema,
  property: unknown,
  newParent: Schema = oldParent,
  name = 'value'
): [Schema, Schema] {
  return [oldParent, { ...newParent, properties: { [name]: property } }];
}

describe('OpenAPI property addition proofs', () => {
  test.each([
    {
      name: 'true schema does not restrict an open input',
      direction: 'request' as const,
      schemas: addingProperty(objectWith({}), true),
      breaking: false,
    },
    {
      name: 'empty schema does not restrict an open input',
      direction: 'request' as const,
      schemas: addingProperty(objectWith({}), {}),
      breaking: false,
    },
    {
      name: 'annotations do not restrict an open input',
      direction: 'request' as const,
      schemas: addingProperty(objectWith({}), {
        description: 'Documented field',
        default: 1,
        examples: [1],
      }),
      breaking: false,
    },
    {
      name: 'false schema forbids a previously accepted input property',
      direction: 'request' as const,
      schemas: addingProperty(objectWith({}), false),
      breaking: true,
    },
    {
      name: 'optional false property remains impossible in a closed output',
      direction: 'response' as const,
      schemas: addingProperty(objectWith({}, true), false),
      breaking: false,
    },
    {
      name: 'required input property is breaking even with an unrestricted value',
      direction: 'request' as const,
      schemas: addingProperty(objectWith({}), true, { ...objectWith({}), required: ['value'] }),
      breaking: true,
    },
    {
      name: 'already-required input property is not newly required',
      direction: 'request' as const,
      schemas: addingProperty({ ...objectWith({}), required: ['value'] }, true),
      breaking: false,
    },
    {
      name: 'required output property is allowed by an old open object',
      direction: 'response' as const,
      schemas: addingProperty(
        objectWith({}),
        { type: 'string' },
        { ...objectWith({}), required: ['value'] }
      ),
      breaking: false,
    },
    {
      name: 'equal schema-valued additionalProperties keeps input compatible',
      direction: 'request' as const,
      schemas: addingProperty(
        { ...objectWith({}), additionalProperties: { type: 'string' } },
        { type: 'string', description: 'Documented' }
      ),
      breaking: false,
    },
    {
      name: 'narrower output retains the old additionalProperties type',
      direction: 'response' as const,
      schemas: addingProperty(
        { ...objectWith({}), additionalProperties: { type: 'string' } },
        { type: 'string', enum: ['a'] }
      ),
      breaking: false,
    },
    {
      name: 'unrestricted output no longer satisfies schema-valued additionalProperties',
      direction: 'response' as const,
      schemas: addingProperty({ ...objectWith({}), additionalProperties: { type: 'string' } }, {}),
      breaking: true,
    },
    {
      name: 'narrower input rejects values accepted by old additionalProperties',
      direction: 'request' as const,
      schemas: addingProperty(
        { ...objectWith({}), additionalProperties: { type: 'string' } },
        { type: 'string', enum: ['a'] }
      ),
      breaking: true,
    },
    {
      name: 'matching pattern applies instead of a closed additionalProperties rule',
      direction: 'response' as const,
      schemas: addingProperty(
        { ...objectWith({}, true), patternProperties: { '^value$': { type: 'string' } } },
        { type: 'string' }
      ),
      breaking: false,
    },
    {
      name: 'declaring a property does not remove its matching pattern',
      direction: 'response' as const,
      schemas: addingProperty(
        { ...objectWith({}, true), patternProperties: { '^value$': { type: 'string' } } },
        true
      ),
      breaking: false,
    },
    {
      name: 'new input constraint intersects its existing matching pattern',
      direction: 'request' as const,
      schemas: addingProperty(
        { ...objectWith({}), patternProperties: { '^value$': { type: 'string' } } },
        { type: 'boolean' }
      ),
      breaking: true,
    },
    {
      name: 'all matching patterns contribute constraints',
      direction: 'request' as const,
      schemas: addingProperty(
        {
          ...objectWith({}),
          patternProperties: { '^v': { type: 'string' }, e$: { minLength: 2 } },
        },
        { type: 'string', minLength: 2 }
      ),
      breaking: false,
    },
    {
      name: 'nonmatching pattern does not protect a new output in a closed object',
      direction: 'response' as const,
      schemas: addingProperty(
        { ...objectWith({}, true), patternProperties: { '^other$': { type: 'string' } } },
        { type: 'string' }
      ),
      breaking: true,
    },
    {
      name: 'a property name containing composition keywords does not create composition context',
      direction: 'response' as const,
      schemas: addingProperty(objectWith({}), { type: 'string' }, undefined, 'oneOf/0/x'),
      breaking: false,
    },
  ])('$name', ({ direction, schemas, breaking }) => {
    const result = diffOpenApiObjects(spec(direction, schemas[0]), spec(direction, schemas[1]));
    const addition = result.changes.find((change) => change.category === 'property-added');
    expect(addition?.severity).toBe(breaking ? 'breaking' : 'non-breaking');
    expect(result.summary.breaking > 0).toBe(breaking);
  });

  test('oneOf input widening can make previously exclusive branches overlap', () => {
    const branch = objectWith({}, true);
    const second = { ...objectWith({ value: { type: 'string' } }, true), required: ['value'] };
    const oldSchema = { oneOf: [branch, second] };
    const newSchema = { oneOf: [objectWith({ value: { type: 'string' } }, true), second] };
    const result = diffOpenApiObjects(spec('request', oldSchema), spec('request', newSchema));
    expect(result.changes).toEqual([
      expect.objectContaining({ category: 'property-added', severity: 'breaking' }),
    ]);
  });

  test('an ancestor unevaluatedProperties can reject the new response field', () => {
    const oldSchema = { allOf: [objectWith({})], unevaluatedProperties: false };
    const newSchema = {
      allOf: [objectWith({ value: { type: 'string' } })],
      unevaluatedProperties: false,
    };
    const result = diffOpenApiObjects(spec('response', oldSchema), spec('response', newSchema));
    expect(result.changes).toEqual([
      expect.objectContaining({ category: 'property-added', severity: 'breaking' }),
    ]);
  });

  test('maxContains can reverse the effect of widening a contains schema', () => {
    const oldSchema = {
      type: 'array',
      contains: objectWith({}, true),
      minContains: 0,
      maxContains: 1,
    };
    const newSchema = { ...oldSchema, contains: objectWith({ value: { type: 'string' } }, true) };
    const result = diffOpenApiObjects(spec('request', oldSchema), spec('request', newSchema));
    expect(result.changes).toEqual([
      expect.objectContaining({ category: 'property-added', severity: 'breaking' }),
    ]);
  });
});

test('same-name parameters retain their own property addition contexts', () => {
  function parameterSpec(added: boolean): Record<string, unknown> {
    return {
      openapi: '3.1.0',
      info: { title: 'Parameter contexts', version: '1.0.0' },
      paths: {
        '/tasks': {
          get: {
            parameters: [
              {
                in: 'query',
                name: 'options',
                schema: objectWith(added ? { value: { type: 'boolean' } } : {}, true),
              },
              {
                in: 'header',
                name: 'options',
                schema: objectWith(added ? { value: { type: 'boolean' } } : {}),
              },
            ],
            responses: { 200: { description: 'Success' } },
          },
        },
      },
    };
  }
  const result = diffOpenApiObjects(parameterSpec(false), parameterSpec(true));
  expect(result.changes.map(({ severity }) => severity)).toEqual(['non-breaking', 'breaking']);
});

test('negated property changes retain conservative classification', () => {
  const oldSchema = { not: objectWith({}, true) };
  const newSchema = { not: objectWith({ value: { type: 'boolean' } }, true) };
  const result = diffOpenApiObjects(spec('request', oldSchema), spec('request', newSchema));
  expect(result.changes).toEqual([
    expect.objectContaining({ category: 'not-schema-changed', severity: 'breaking' }),
  ]);
});

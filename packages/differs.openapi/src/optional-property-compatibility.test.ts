import { describe, expect, test } from 'vitest';
import { diffOpenApiObjects } from './differ.js';

type Schema = Record<string, unknown>;
type Direction = 'request' | 'response';

function spec(direction: Direction, schema: Schema, openapi = '3.1.0'): Record<string, unknown> {
  return {
    openapi,
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

describe('property additions respect OpenAPI nullable semantics', () => {
  test.each([
    {
      name: 'request loses previously allowed null',
      direction: 'request' as const,
      oldNullable: true,
      newNullable: false,
      severity: 'breaking',
    },
    {
      name: 'response introduces a previously forbidden null',
      direction: 'response' as const,
      oldNullable: false,
      newNullable: true,
      severity: 'breaking',
    },
    {
      name: 'request permits additional null values',
      direction: 'request' as const,
      oldNullable: false,
      newNullable: true,
      severity: 'non-breaking',
    },
    {
      name: 'response no longer returns null',
      direction: 'response' as const,
      oldNullable: true,
      newNullable: false,
      severity: 'non-breaking',
    },
    {
      name: 'equal nullable constraints preserve compatibility',
      direction: 'request' as const,
      oldNullable: true,
      newNullable: true,
      severity: 'non-breaking',
    },
  ])('$name', ({ direction, oldNullable, newNullable, severity }) => {
    const oldSchema = {
      type: 'object',
      additionalProperties: { type: 'string', ...(oldNullable ? { nullable: true } : {}) },
    };
    const newSchema = {
      ...oldSchema,
      properties: { value: { type: 'string', ...(newNullable ? { nullable: true } : {}) } },
    };
    const result = diffOpenApiObjects(
      spec(direction, oldSchema, '3.0.3'),
      spec(direction, newSchema, '3.0.3')
    );
    expect(result.changes).toEqual([
      expect.objectContaining({ category: 'property-added', severity }),
    ]);
  });

  test.each(['request', 'response'] as const)(
    '3.1 nullable does not widen the %s type',
    (direction) => {
      const oldSchema = { type: 'object', additionalProperties: { type: 'string' } };
      const newSchema = { ...oldSchema, properties: { value: { type: 'string', nullable: true } } };
      expect(
        diffOpenApiObjects(spec(direction, oldSchema), spec(direction, newSchema)).summary.breaking
      ).toBe(0);
    }
  );

  test('nullable does not override enum constraints', () => {
    const oldSchema = { type: 'object', additionalProperties: { enum: ['a'] } };
    const newSchema = {
      ...oldSchema,
      properties: { value: { type: 'string', nullable: true, enum: ['a'] } },
    };
    expect(
      diffOpenApiObjects(spec('response', oldSchema, '3.0.3'), spec('response', newSchema, '3.0.3'))
        .summary.breaking
    ).toBe(0);
  });

  test('nullable without a local type does not introduce a type restriction', () => {
    const oldSchema = { type: 'object' };
    const newSchema = { ...oldSchema, properties: { value: { nullable: true } } };
    expect(
      diffOpenApiObjects(spec('request', oldSchema, '3.0.3'), spec('request', newSchema, '3.0.3'))
        .summary.breaking
    ).toBe(0);
  });
});

test('a dialect change cannot prove equal nested nullable schemas compatible', () => {
  const value = { type: 'object', properties: { nested: { type: 'string', nullable: true } } };
  const oldSchema = { type: 'object', additionalProperties: value };
  const newSchema = { ...oldSchema, properties: { value } };
  const result = diffOpenApiObjects(
    spec('request', oldSchema, '3.0.3'),
    spec('request', newSchema, '3.1.0')
  );
  expect(result.changes).toEqual([
    expect.objectContaining({ category: 'property-added', severity: 'breaking' }),
  ]);
});

describe('property additions respect explicit JSON Schema dialects', () => {
  const draft4 = 'http://json-schema.org/draft-04/schema#';
  const draft7 = 'http://json-schema.org/draft-07/schema#';
  const draft2020 = 'https://json-schema.org/draft/2020-12/schema';

  test('an embedded draft-04 const cannot prove response compatibility', () => {
    const oldSchema = { type: 'object', additionalProperties: { const: 1 } };
    const newSchema = {
      ...oldSchema,
      properties: { value: { $schema: draft4, $id: 'urn:value', id: 'urn:value', const: 1 } },
    };
    // { value: 2 } is new-valid because draft-04 does not enforce const.
    expect(
      diffOpenApiObjects(spec('response', oldSchema), spec('response', newSchema)).changes
    ).toEqual([expect.objectContaining({ category: 'property-added', severity: 'breaking' })]);
  });

  test.each(['document', 'parent', 'ancestor'] as const)(
    '%s dialect changes invalidate textually equal nested constraints',
    (location) => {
      const value = { type: 'object', unevaluatedProperties: false };
      let oldSchema: Schema = { type: 'object', additionalProperties: value };
      let newSchema: Schema = { ...oldSchema, properties: { value } };
      if (location === 'ancestor') {
        oldSchema = { type: 'object', properties: { nested: oldSchema } };
        newSchema = { type: 'object', properties: { nested: newSchema } };
      }
      if (location !== 'document') {
        oldSchema.$schema = draft7;
        newSchema.$schema = draft2020;
      }
      const oldSpec = spec('request', oldSchema);
      const newSpec = spec('request', newSchema);
      if (location === 'document') {
        oldSpec.jsonSchemaDialect = draft7;
        newSpec.jsonSchemaDialect = draft2020;
      }
      // A value with any property was accepted when unevaluatedProperties was
      // ignored by draft-07, but is rejected under 2020-12.
      expect(diffOpenApiObjects(oldSpec, newSpec).changes).toContainEqual(
        expect.objectContaining({ category: 'property-added', severity: 'breaking' })
      );
    }
  );

  test('identical nested schemas with unsupported dialects require review', () => {
    const value = { type: 'object', properties: { nested: { $schema: draft4, const: 1 } } };
    const oldSchema = { type: 'object', additionalProperties: value };
    const newSchema = { ...oldSchema, properties: { value } };
    expect(
      diffOpenApiObjects(spec('response', oldSchema), spec('response', newSchema)).changes
    ).toEqual([expect.objectContaining({ category: 'property-added', severity: 'breaking' })]);
  });

  test.each(['https://spec.openapis.org/oas/3.1/dialect/base', draft2020, `${draft2020}#`])(
    'supported explicit dialect %s preserves compatibility',
    (dialect) => {
      const oldSchema = { $schema: dialect, type: 'object', additionalProperties: { const: 1 } };
      const newSchema = { ...oldSchema, properties: { value: { $schema: dialect, const: 1 } } };
      const oldSpec = { ...spec('response', oldSchema), jsonSchemaDialect: dialect };
      const newSpec = { ...spec('response', newSchema), jsonSchemaDialect: dialect };
      expect(diffOpenApiObjects(oldSpec, newSpec).changes).toEqual([
        expect.objectContaining({ category: 'property-added', severity: 'non-breaking' }),
      ]);
    }
  );
});

describe('dialect detection distinguishes schemas from user data', () => {
  test.each([{ default: { $schema: 'user data' } }, { examples: [{ $schema: 'user data' }] }])(
    'annotation %j does not constrain an open input',
    (value) => {
      const oldSchema = { type: 'object' };
      const newSchema = { ...oldSchema, properties: { value } };
      expect(
        diffOpenApiObjects(spec('request', oldSchema), spec('request', newSchema)).changes
      ).toEqual([
        expect.objectContaining({ category: 'property-added', severity: 'non-breaking' }),
      ]);
    }
  );

  test.each([
    { type: 'object', properties: { $schema: { type: 'string' } } },
    { const: { $schema: 'user data' } },
    { enum: [{ $schema: 'user data' }] },
  ])('equal constraints with literal $schema data remain compatible: %j', (value) => {
    const oldSchema = { type: 'object', additionalProperties: value };
    const newSchema = { ...oldSchema, properties: { value } };
    expect(
      diffOpenApiObjects(spec('request', oldSchema), spec('request', newSchema)).changes
    ).toEqual([expect.objectContaining({ category: 'property-added', severity: 'non-breaking' })]);
  });
});

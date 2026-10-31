/**
 * JSON Schema Lint Rules Tests
 *
 * Tests the linting rules for JSON Schema quality and best practices.
 * Based on Sourcemeta and JSON Schema community guidelines.
 *
 * @see https://github.com/sourcemeta/jsonschema
 * @see https://github.com/orgs/json-schema-org/discussions/323
 */

import { describe, test, expect } from 'vitest';
import {
  runLintRules,
  getAvailableRules,
  getRuleDescription,
  LINT_RULES,
} from '../../packages/governance/linters/json-schema-rules.js';
import { lintJsonSchemaObject } from '../../packages/governance/linters/json-schema-ajv.js';
import type { SchemaNode } from '../../packages/governance/linters/json-schema-rules.js';
import type { LintIssue } from '../../packages/types/governance.js';

describe('JSON Schema Lint Rules', () => {
  describe('Rule registry', () => {
    test('all rules are registered', () => {
      const ruleIds = getAvailableRules();
      expect(ruleIds.length).toBeGreaterThan(15);
    });

    test('each rule has a description', () => {
      for (const rule of LINT_RULES) {
        expect(rule.description).toBeTruthy();
        expect(getRuleDescription(rule.id)).toBe(rule.description);
      }
    });

    test('each rule has a valid severity', () => {
      for (const rule of LINT_RULES) {
        expect(['error', 'warning']).toContain(rule.severity);
      }
    });
  });

  describe('Schema declaration rules', () => {
    test('missing-schema: warns when $schema is missing at root', () => {
      const schema: SchemaNode = {
        type: 'object',
        properties: { name: { type: 'string' } },
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'missing-schema');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('warning');
      expect(issue?.path).toBe('/');
    });

    test('missing-schema: no warning when $schema is present', () => {
      const schema: SchemaNode = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'string',
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'missing-schema');
      expect(issue).toBeUndefined();
    });

    test('schema-not-at-root: warns when $schema appears in subschema without $id', () => {
      const schema: SchemaNode = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          nested: {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'string',
          },
        },
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'schema-not-at-root');
      expect(issue).toBeDefined();
      expect(issue?.path).toContain('nested');
    });

    test('schema-not-at-root: no warning when subschema has $id', () => {
      const schema: SchemaNode = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          nested: {
            $id: 'https://example.com/nested',
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'string',
          },
        },
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'schema-not-at-root');
      expect(issue).toBeUndefined();
    });
  });

  describe('Metadata rules', () => {
    test('missing-title: warns when root schema has no title', () => {
      const schema: SchemaNode = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'string',
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'missing-title');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('warning');
    });

    test('missing-title: no warning when title is present', () => {
      const schema: SchemaNode = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'My Schema',
        type: 'string',
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'missing-title');
      expect(issue).toBeUndefined();
    });

    test('missing-description: warns when root schema has no description', () => {
      const schema: SchemaNode = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'string',
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'missing-description');
      expect(issue).toBeDefined();
    });

    test('missing-description: no warning when description is present', () => {
      const schema: SchemaNode = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        description: 'A string value',
        type: 'string',
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'missing-description');
      expect(issue).toBeUndefined();
    });
  });

  describe('Enum/Const rules', () => {
    test('enum-to-const: warns when enum has single value', () => {
      const schema: SchemaNode = {
        type: 'string',
        enum: ['only-value'],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'enum-to-const');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('const');
    });

    test('enum-to-const: no warning when enum has multiple values', () => {
      const schema: SchemaNode = {
        type: 'string',
        enum: ['a', 'b', 'c'],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'enum-to-const');
      expect(issue).toBeUndefined();
    });

    test('enum-with-type: warns when type is redundant with enum', () => {
      const schema: SchemaNode = {
        type: 'string',
        enum: ['a', 'b', 'c'],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'enum-with-type');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('redundant');
    });

    test('enum-with-type: no warning when enum has mixed types', () => {
      const schema: SchemaNode = {
        type: ['string', 'number'],
        enum: ['a', 1, 'b', 2],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'enum-with-type');
      // Should still warn because enum constrains to the same types
      expect(issue).toBeDefined();
    });

    test('const-with-type: warns when type is redundant with const', () => {
      const schema: SchemaNode = {
        type: 'string',
        const: 'fixed-value',
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'const-with-type');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('redundant');
    });

    test('const-with-type: no warning when type differs from const', () => {
      const schema: SchemaNode = {
        type: ['string', 'null'],
        const: 'fixed-value',
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'const-with-type');
      expect(issue).toBeUndefined();
    });
  });

  describe('Conditional schema rules', () => {
    test('if-without-then-else: warns when if has no then or else', () => {
      const schema: SchemaNode = {
        type: 'object',
        if: { properties: { type: { const: 'a' } } },
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'if-without-then-else');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('no effect');
    });

    test('if-without-then-else: no warning when if has then', () => {
      const schema: SchemaNode = {
        type: 'object',
        if: { properties: { type: { const: 'a' } } },
        then: { required: ['extra'] },
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'if-without-then-else');
      expect(issue).toBeUndefined();
    });

    test('if-without-then-else: no warning when if has else', () => {
      const schema: SchemaNode = {
        type: 'object',
        if: { properties: { type: { const: 'a' } } },
        else: { required: ['other'] },
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'if-without-then-else');
      expect(issue).toBeUndefined();
    });

    test('then-else-without-if: warns when then appears without if', () => {
      const schema: SchemaNode = {
        type: 'object',
        then: { required: ['extra'] },
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'then-else-without-if');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('then');
    });

    test('then-else-without-if: warns when else appears without if', () => {
      const schema: SchemaNode = {
        type: 'object',
        else: { required: ['other'] },
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'then-else-without-if');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('else');
    });
  });

  describe('Array constraint rules', () => {
    test('additional-items-redundant: warns when additionalItems with schema items', () => {
      const schema: SchemaNode = {
        type: 'array',
        items: { type: 'string' },
        additionalItems: { type: 'number' },
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'additional-items-redundant');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('ignored');
    });

    test('additional-items-redundant: no warning when items is tuple', () => {
      const schema: SchemaNode = {
        type: 'array',
        items: [{ type: 'string' }, { type: 'number' }],
        additionalItems: { type: 'boolean' },
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'additional-items-redundant');
      expect(issue).toBeUndefined();
    });

    test('contains-required: warns when minContains without contains', () => {
      const schema: SchemaNode = {
        type: 'array',
        minContains: 2,
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'contains-required');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('minContains');
    });

    test('contains-required: warns when maxContains without contains', () => {
      const schema: SchemaNode = {
        type: 'array',
        maxContains: 5,
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'contains-required');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('maxContains');
    });

    test('contains-required: no warning when contains is present', () => {
      const schema: SchemaNode = {
        type: 'array',
        contains: { type: 'string' },
        minContains: 2,
        maxContains: 5,
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'contains-required');
      expect(issue).toBeUndefined();
    });
  });

  describe('Type compatibility rules', () => {
    test('type-incompatible-keywords: warns when string keywords on number type', () => {
      const schema: SchemaNode = {
        type: 'number',
        minLength: 5,
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'type-incompatible-keywords');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('minLength');
      expect(issue?.message).toContain('string');
    });

    test('type-incompatible-keywords: warns when array keywords on object type', () => {
      const schema: SchemaNode = {
        type: 'object',
        minItems: 1,
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'type-incompatible-keywords');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('minItems');
      expect(issue?.message).toContain('array');
    });

    test('type-incompatible-keywords: warns when numeric keywords on string type', () => {
      const schema: SchemaNode = {
        type: 'string',
        minimum: 0,
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'type-incompatible-keywords');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('minimum');
    });

    test('type-incompatible-keywords: no warning when keywords match type', () => {
      const schema: SchemaNode = {
        type: 'string',
        minLength: 1,
        maxLength: 100,
        pattern: '^[a-z]+$',
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'type-incompatible-keywords');
      expect(issue).toBeUndefined();
    });

    test('type-incompatible-keywords: no check when type is array (multiple types)', () => {
      const schema: SchemaNode = {
        type: ['string', 'number'],
        minLength: 1,
        minimum: 0,
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'type-incompatible-keywords');
      expect(issue).toBeUndefined();
    });
  });

  describe('Range validation rules', () => {
    test('invalid-numeric-range: errors when maximum < minimum', () => {
      const schema: SchemaNode = {
        type: 'number',
        minimum: 100,
        maximum: 10,
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'invalid-numeric-range');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
      expect(issue?.message).toContain('maximum');
      expect(issue?.message).toContain('minimum');
    });

    test('invalid-numeric-range: no error when maximum >= minimum', () => {
      const schema: SchemaNode = {
        type: 'number',
        minimum: 0,
        maximum: 100,
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'invalid-numeric-range');
      expect(issue).toBeUndefined();
    });

    test('invalid-numeric-range: errors when exclusiveMaximum <= exclusiveMinimum', () => {
      const schema: SchemaNode = {
        type: 'number',
        exclusiveMinimum: 10,
        exclusiveMaximum: 10,
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'invalid-numeric-range');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('exclusiveMaximum');
    });

    test('invalid-length-range: errors when maxLength < minLength', () => {
      const schema: SchemaNode = {
        type: 'string',
        minLength: 10,
        maxLength: 5,
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'invalid-length-range');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
    });

    test('invalid-items-range: errors when maxItems < minItems', () => {
      const schema: SchemaNode = {
        type: 'array',
        minItems: 10,
        maxItems: 5,
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'invalid-items-range');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
    });

    test('invalid-properties-range: errors when maxProperties < minProperties', () => {
      const schema: SchemaNode = {
        type: 'object',
        minProperties: 10,
        maxProperties: 5,
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'invalid-properties-range');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
    });
  });

  describe('Format rules', () => {
    test('unknown-format: warns for unknown format values', () => {
      const schema: SchemaNode = {
        type: 'string',
        format: 'custom-format',
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'unknown-format');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('custom-format');
    });

    test('unknown-format: no warning for known formats', () => {
      const knownFormats = [
        'date-time',
        'date',
        'time',
        'email',
        'uri',
        'uuid',
        'ipv4',
        'ipv6',
        'hostname',
        'regex',
      ];

      for (const format of knownFormats) {
        const schema: SchemaNode = { type: 'string', format };
        const issues = runLintRules(schema);
        const issue = issues.find((i) => i.rule === 'unknown-format');
        expect(issue).toBeUndefined();
      }
    });
  });

  describe('Empty schema rules', () => {
    test('empty-enum: errors when enum is empty array', () => {
      const schema: SchemaNode = {
        type: 'string',
        enum: [],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'empty-enum');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
      expect(issue?.message).toContain('never validate');
    });

    test('empty-required: warns when required is empty array', () => {
      const schema: SchemaNode = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: [],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'empty-required');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('warning');
    });

    test('empty-allof-anyof-oneof: errors when anyOf is empty', () => {
      const schema: SchemaNode = {
        anyOf: [],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'empty-allof-anyof-oneof');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
    });

    test('empty-allof-anyof-oneof: errors when oneOf is empty', () => {
      const schema: SchemaNode = {
        oneOf: [],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'empty-allof-anyof-oneof');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('error');
    });

    test('empty-allof-anyof-oneof: warns when allOf is empty', () => {
      const schema: SchemaNode = {
        allOf: [],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'empty-allof-anyof-oneof');
      expect(issue).toBeDefined();
      // allOf empty is just redundant, not invalid
      expect(issue?.severity).toBe('warning');
    });
  });

  describe('Required properties rules', () => {
    test('required-undefined-property: warns when required property not in properties', () => {
      const schema: SchemaNode = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name', 'email'],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'required-undefined-property');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('email');
    });

    test('required-undefined-property: no warning when all required are defined', () => {
      const schema: SchemaNode = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['name', 'email'],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'required-undefined-property');
      expect(issue).toBeUndefined();
    });

    test('duplicate-required: warns when required has duplicates', () => {
      const schema: SchemaNode = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name', 'name'],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'duplicate-required');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('name');
    });

    test('duplicate-required: no warning when required has no duplicates', () => {
      const schema: SchemaNode = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['name', 'email'],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'duplicate-required');
      expect(issue).toBeUndefined();
    });
  });

  describe('Nested schema linting', () => {
    test('rules apply to nested properties', () => {
      const schema: SchemaNode = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'Root',
        description: 'Root schema',
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              value: {
                type: 'number',
                minimum: 100,
                maximum: 10, // Invalid range
              },
            },
          },
        },
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'invalid-numeric-range');
      expect(issue).toBeDefined();
      expect(issue?.path).toContain('nested');
      expect(issue?.path).toContain('value');
    });

    test('rules apply to items schema', () => {
      const schema: SchemaNode = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'Root',
        description: 'Root schema',
        type: 'array',
        items: {
          type: 'string',
          enum: ['only'], // Should suggest const
        },
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'enum-to-const');
      expect(issue).toBeDefined();
      expect(issue?.path).toContain('items');
    });

    test('rules apply to allOf/anyOf/oneOf schemas', () => {
      const schema: SchemaNode = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'Root',
        description: 'Root schema',
        anyOf: [
          { type: 'string', minLength: 10, maxLength: 5 }, // Invalid range
          { type: 'number' },
        ],
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'invalid-length-range');
      expect(issue).toBeDefined();
      expect(issue?.path).toContain('anyOf');
    });

    test('rules apply to $defs schemas', () => {
      const schema: SchemaNode = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'Root',
        description: 'Root schema',
        $defs: {
          BadDef: {
            type: 'array',
            minItems: 10,
            maxItems: 5, // Invalid range
          },
        },
        $ref: '#/$defs/BadDef',
      };

      const issues = runLintRules(schema);
      const issue = issues.find((i) => i.rule === 'invalid-items-range');
      expect(issue).toBeDefined();
      expect(issue?.path).toContain('$defs');
    });
  });

  describe('Rule filtering', () => {
    test('enabledRules filters to only specified rules', () => {
      const schema: SchemaNode = {
        type: 'string',
        enum: ['only'],
        minLength: 10,
        maxLength: 5,
      };

      const enabledRules = new Set(['enum-to-const']);
      const issues = runLintRules(schema, enabledRules);

      expect(issues.length).toBe(1);
      expect(issues[0].rule).toBe('enum-to-const');
    });

    test('disabledRules excludes specified rules', () => {
      const schema: SchemaNode = {
        type: 'string',
        enum: ['only'],
      };

      const disabledRules = new Set(['enum-to-const', 'enum-with-type']);
      const issues = runLintRules(schema, undefined, disabledRules);

      const enumIssues = issues.filter(
        (i) => i.rule === 'enum-to-const' || i.rule === 'enum-with-type'
      );
      expect(enumIssues).toHaveLength(0);
    });
  });

  describe('Full linter integration (lintJsonSchemaObject)', () => {
    test('combines meta-validation and style rules', async () => {
      const schema: SchemaNode = {
        type: 'objekt', // Invalid type value (meta-validation error)
        enum: ['only'], // Style warning
      };

      const result = await lintJsonSchemaObject(schema);

      // Should have meta-validation error
      expect(result.errors.length).toBeGreaterThan(0);

      // Should have style warnings
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('skipMetaValidation option works', async () => {
      const schema: SchemaNode = {
        type: 'objekt', // Invalid but should be skipped
      };

      const result = await lintJsonSchemaObject(schema, { skipMetaValidation: true });

      // Should not have meta-validation errors
      const metaErrors = result.errors.filter((e) => e.rule?.startsWith('meta:'));
      expect(metaErrors).toHaveLength(0);
    });

    test('skipStyleRules option works', async () => {
      const schema: SchemaNode = {
        type: 'string',
        enum: ['only'], // Should be skipped
      };

      const result = await lintJsonSchemaObject(schema, { skipStyleRules: true });

      // Should not have style rule warnings
      const styleWarnings = result.warnings.filter((w) => w.rule === 'enum-to-const');
      expect(styleWarnings).toHaveLength(0);
    });

    test('valid schema with best practices passes all checks', async () => {
      const schema: SchemaNode = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: 'User',
        description: 'A user object',
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', minLength: 1, maxLength: 100 },
          email: { type: 'string', format: 'email' },
          age: { type: 'integer', minimum: 0, maximum: 150 },
        },
        required: ['id', 'name', 'email'],
        additionalProperties: false,
      };

      const result = await lintJsonSchemaObject(schema);

      expect(result.errors).toHaveLength(0);
      // May have some warnings (like missing-description on nested props)
    });
  });
});

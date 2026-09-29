/**
 * Strands API Conformance Tests
 *
 * Tests the compareSchemas function against expected Strands API behavior.
 * Based on the Strands API at https://strands.octue.com/api/compare-schemas
 */

import { describe, test, expect } from 'vitest';
import {
  compareSchemas,
  checkCompatibility,
} from '../../packages/differs.json-schema/src/compare.js';
import type {
  CompareResult,
  CompareOptions,
  StrandsTrace,
  StrandsCompatibility,
  StrandsVersion,
  SemanticVersion,
  ResolvedSchema,
} from '../../packages/differs.json-schema/src/types.js';

describe('Strands API Conformance', () => {
  describe('Basic comparison results', () => {
    test('identical schemas return equal version', () => {
      const schema: ResolvedSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const result: CompareResult = compareSchemas(schema, schema);
      expect(result.version).toBe<StrandsVersion>('equal');
      expect(result.traces).toHaveLength(0);
    });

    test('no changes returns equal with currentVersion', () => {
      const schema: ResolvedSchema = { type: 'string' };
      const options: CompareOptions = { currentVersion: '1.0.0' };
      const result: CompareResult = compareSchemas(schema, schema, options);

      expect(result.version).toBe<StrandsVersion>('equal');
      const expectedVersion: SemanticVersion = {
        major: 1,
        minor: 0,
        patch: 0,
        version: '1.0.0',
      };
      expect(result.newVersion).toEqual(expectedVersion);
    });
  });

  describe('Format changes are patch (not breaking)', () => {
    test('format-added is patch', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: 'string', format: 'email' };

      const result: CompareResult = compareSchemas(source, target, { currentVersion: '1.0.0' });
      expect(result.version).toBe<StrandsVersion>('patch');
      expect(result.newVersion?.version).toBe('1.0.1');
    });

    test('format-removed is patch', () => {
      const source: ResolvedSchema = { type: 'string', format: 'email' };
      const target: ResolvedSchema = { type: 'string' };

      const result: CompareResult = compareSchemas(source, target, { currentVersion: '1.0.0' });
      expect(result.version).toBe<StrandsVersion>('patch');
    });

    test('format-changed is patch', () => {
      const source: ResolvedSchema = { type: 'string', format: 'email' };
      const target: ResolvedSchema = { type: 'string', format: 'uri' };

      const result: CompareResult = compareSchemas(source, target, { currentVersion: '1.0.0' });
      expect(result.version).toBe<StrandsVersion>('patch');
    });
  });

  describe('Type changes classification', () => {
    test('type change is breaking (major)', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: 'number' };

      const result: CompareResult = compareSchemas(source, target, { currentVersion: '1.0.0' });
      expect(result.version).toBe<StrandsVersion>('major');
      expect(result.newVersion?.version).toBe('2.0.0');
    });

    test('type narrowed is breaking', () => {
      const source: ResolvedSchema = { type: ['string', 'number'] };
      const target: ResolvedSchema = { type: 'string' };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });

    test('type widened is non-breaking (minor)', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: ['string', 'number'] };

      const result: CompareResult = compareSchemas(source, target, { currentVersion: '1.0.0' });
      expect(result.version).toBe<StrandsVersion>('minor');
      expect(result.newVersion?.version).toBe('1.1.0');
    });
  });

  describe('Property changes classification', () => {
    test('property-added is non-breaking (minor)', () => {
      const source: ResolvedSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
      };
      const target: ResolvedSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
      };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('minor');
    });

    test('property-removed is breaking (major)', () => {
      const source: ResolvedSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
        },
      };
      const target: ResolvedSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
      };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });

    test('required-added is breaking', () => {
      const source: ResolvedSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
      };
      const target: ResolvedSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });

    test('required-removed is non-breaking', () => {
      const source: ResolvedSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      };
      const target: ResolvedSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
      };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('minor');
    });
  });

  describe('Enum changes classification', () => {
    test('enum-value-added is non-breaking', () => {
      const source: ResolvedSchema = { type: 'string', enum: ['a', 'b'] };
      const target: ResolvedSchema = { type: 'string', enum: ['a', 'b', 'c'] };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('minor');
    });

    test('enum-value-removed is breaking', () => {
      const source: ResolvedSchema = { type: 'string', enum: ['a', 'b', 'c'] };
      const target: ResolvedSchema = { type: 'string', enum: ['a', 'b'] };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });

    test('enum-added is breaking', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: 'string', enum: ['a', 'b'] };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });

    test('enum-removed is non-breaking', () => {
      const source: ResolvedSchema = { type: 'string', enum: ['a', 'b'] };
      const target: ResolvedSchema = { type: 'string' };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('minor');
    });
  });

  describe('Constraint changes classification', () => {
    test('constraint-tightened is breaking', () => {
      const source: ResolvedSchema = { type: 'number', minimum: 0 };
      const target: ResolvedSchema = { type: 'number', minimum: 10 };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });

    test('constraint-loosened is non-breaking', () => {
      const source: ResolvedSchema = { type: 'number', minimum: 10 };
      const target: ResolvedSchema = { type: 'number', minimum: 0 };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('minor');
    });

    test('minItems-increased is breaking', () => {
      const source: ResolvedSchema = { type: 'array', items: { type: 'string' }, minItems: 1 };
      const target: ResolvedSchema = { type: 'array', items: { type: 'string' }, minItems: 5 };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });

    test('maxItems-decreased is breaking', () => {
      const source: ResolvedSchema = { type: 'array', items: { type: 'string' }, maxItems: 10 };
      const target: ResolvedSchema = { type: 'array', items: { type: 'string' }, maxItems: 5 };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });
  });

  describe('additionalProperties changes', () => {
    test('additionalProperties denied is breaking', () => {
      const source: ResolvedSchema = { type: 'object', properties: { name: { type: 'string' } } };
      const target: ResolvedSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: false,
      };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });

    test('additionalProperties allowed is non-breaking', () => {
      const source: ResolvedSchema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: false,
      };
      const target: ResolvedSchema = { type: 'object', properties: { name: { type: 'string' } } };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('minor');
    });
  });

  describe('Metadata changes are patch', () => {
    test('description-changed is patch', () => {
      const source: ResolvedSchema = { type: 'string', description: 'Old description' };
      const target: ResolvedSchema = { type: 'string', description: 'New description' };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('patch');
    });

    test('title-changed is patch', () => {
      const source: ResolvedSchema = { type: 'string', title: 'Old title' };
      const target: ResolvedSchema = { type: 'string', title: 'New title' };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('patch');
    });

    test('default-changed is patch', () => {
      const source: ResolvedSchema = { type: 'string', default: 'old' };
      const target: ResolvedSchema = { type: 'string', default: 'new' };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('patch');
    });

    test('examples-changed is patch', () => {
      const source: ResolvedSchema = { type: 'string', examples: ['old'] };
      const target: ResolvedSchema = { type: 'string', examples: ['new'] };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('patch');
    });
  });

  describe('Annotation changes are patch (Draft 2019-09+)', () => {
    test('deprecated-changed is patch', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: 'string', deprecated: true };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('patch');
    });

    test('readOnly-changed is patch', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: 'string', readOnly: true };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('patch');
    });

    test('writeOnly-changed is patch', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: 'string', writeOnly: true };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('patch');
    });
  });

  describe('Composition changes (anyOf/oneOf/allOf)', () => {
    test('anyOf option added is breaking', () => {
      const source: ResolvedSchema = {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      };
      const target: ResolvedSchema = {
        anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });

    test('anyOf option removed is non-breaking', () => {
      const source: ResolvedSchema = {
        anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      };
      const target: ResolvedSchema = {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('minor');
    });

    test('oneOf option added is breaking', () => {
      const source: ResolvedSchema = {
        oneOf: [{ type: 'string' }, { type: 'number' }],
      };
      const target: ResolvedSchema = {
        oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });

    test('oneOf option removed is non-breaking', () => {
      const source: ResolvedSchema = {
        oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      };
      const target: ResolvedSchema = {
        oneOf: [{ type: 'string' }, { type: 'number' }],
      };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('minor');
    });

    test('allOf member added is breaking', () => {
      const source: ResolvedSchema = {
        allOf: [{ type: 'object', properties: { a: { type: 'string' } } }],
      };
      const target: ResolvedSchema = {
        allOf: [
          { type: 'object', properties: { a: { type: 'string' } } },
          { type: 'object', properties: { b: { type: 'number' } } },
        ],
      };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });

    test('allOf member removed is non-breaking', () => {
      const source: ResolvedSchema = {
        allOf: [
          { type: 'object', properties: { a: { type: 'string' } } },
          { type: 'object', properties: { b: { type: 'number' } } },
        ],
      };
      const target: ResolvedSchema = {
        allOf: [{ type: 'object', properties: { a: { type: 'string' } } }],
      };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('minor');
    });

    test('not schema changed is breaking', () => {
      const source: ResolvedSchema = { not: { type: 'string' } };
      const target: ResolvedSchema = { not: { type: 'number' } };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });
  });

  describe('Draft 2020-12 keywords', () => {
    test('dependentRequired-added is breaking', () => {
      const source: ResolvedSchema = {
        type: 'object',
        properties: {
          creditCard: { type: 'string' },
          billingAddress: { type: 'string' },
        },
      };
      const target: ResolvedSchema = {
        type: 'object',
        properties: {
          creditCard: { type: 'string' },
          billingAddress: { type: 'string' },
        },
        dependentRequired: {
          creditCard: ['billingAddress'],
        },
      };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('major');
    });

    test('dependentRequired-removed is non-breaking', () => {
      const source: ResolvedSchema = {
        type: 'object',
        properties: {
          creditCard: { type: 'string' },
          billingAddress: { type: 'string' },
        },
        dependentRequired: {
          creditCard: ['billingAddress'],
        },
      };
      const target: ResolvedSchema = {
        type: 'object',
        properties: {
          creditCard: { type: 'string' },
          billingAddress: { type: 'string' },
        },
      };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.version).toBe<StrandsVersion>('minor');
    });
  });

  describe('Strands trace format', () => {
    test('traces have correct format', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: 'number' };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.traces.length).toBeGreaterThan(0);

      const validCompatibilities: StrandsCompatibility[] = [
        'incompatible',
        'compatible',
        'unknown',
      ];
      for (const trace of result.traces) {
        // Verify trace conforms to StrandsTrace interface
        const typedTrace: StrandsTrace = trace;
        expect(typedTrace).toHaveProperty('compatibility');
        expect(typedTrace).toHaveProperty('left');
        expect(typedTrace).toHaveProperty('right');
        expect(validCompatibilities).toContain(typedTrace.compatibility);
      }
    });

    test('breaking changes have incompatible traces', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: 'number' };

      const result: CompareResult = compareSchemas(source, target);
      const hasIncompatible = result.traces.some(
        (t: StrandsTrace) => t.compatibility === 'incompatible'
      );
      expect(hasIncompatible).toBe(true);
    });

    test('non-breaking changes have compatible traces', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: ['string', 'number'] };

      const result: CompareResult = compareSchemas(source, target);
      const hasCompatible = result.traces.some(
        (t: StrandsTrace) => t.compatibility === 'compatible'
      );
      expect(hasCompatible).toBe(true);
    });
  });

  describe('newVersion computation', () => {
    test('computes newVersion correctly for major bump', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: 'number' };
      const options: CompareOptions = { currentVersion: '1.2.3' };

      const result: CompareResult = compareSchemas(source, target, options);
      const expectedVersion: SemanticVersion = {
        major: 2,
        minor: 0,
        patch: 0,
        version: '2.0.0',
      };
      expect(result.newVersion).toEqual(expectedVersion);
    });

    test('computes newVersion correctly for minor bump', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: ['string', 'number'] };
      const options: CompareOptions = { currentVersion: '1.2.3' };

      const result: CompareResult = compareSchemas(source, target, options);
      const expectedVersion: SemanticVersion = {
        major: 1,
        minor: 3,
        patch: 0,
        version: '1.3.0',
      };
      expect(result.newVersion).toEqual(expectedVersion);
    });

    test('computes newVersion correctly for patch bump', () => {
      const source: ResolvedSchema = { type: 'string', description: 'old' };
      const target: ResolvedSchema = { type: 'string', description: 'new' };
      const options: CompareOptions = { currentVersion: '1.2.3' };

      const result: CompareResult = compareSchemas(source, target, options);
      const expectedVersion: SemanticVersion = {
        major: 1,
        minor: 2,
        patch: 4,
        version: '1.2.4',
      };
      expect(result.newVersion).toEqual(expectedVersion);
    });

    test('handles v-prefix in currentVersion', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: 'number' };
      const options: CompareOptions = { currentVersion: 'v1.2.3' };

      const result: CompareResult = compareSchemas(source, target, options);
      expect(result.newVersion?.version).toBe('2.0.0');
    });

    test('newVersion is null when currentVersion not provided', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: 'number' };

      const result: CompareResult = compareSchemas(source, target);
      expect(result.newVersion).toBeNull();
    });
  });

  describe('checkCompatibility helper', () => {
    test('returns incompatible for breaking changes', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: 'number' };

      const compatibility: StrandsCompatibility = checkCompatibility(source, target);
      expect(compatibility).toBe<StrandsCompatibility>('incompatible');
    });

    test('returns compatible for non-breaking changes', () => {
      const source: ResolvedSchema = { type: 'string' };
      const target: ResolvedSchema = { type: ['string', 'number'] };

      const compatibility: StrandsCompatibility = checkCompatibility(source, target);
      expect(compatibility).toBe<StrandsCompatibility>('compatible');
    });

    test('returns compatible for patch changes', () => {
      const source: ResolvedSchema = { type: 'string', description: 'old' };
      const target: ResolvedSchema = { type: 'string', description: 'new' };

      const compatibility: StrandsCompatibility = checkCompatibility(source, target);
      expect(compatibility).toBe<StrandsCompatibility>('compatible');
    });

    test('returns compatible for identical schemas', () => {
      const schema: ResolvedSchema = { type: 'string' };

      const compatibility: StrandsCompatibility = checkCompatibility(schema, schema);
      expect(compatibility).toBe<StrandsCompatibility>('compatible');
    });
  });
});

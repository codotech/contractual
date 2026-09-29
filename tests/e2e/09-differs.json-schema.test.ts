import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import {
  createTempRepo,
  copyFixture,
  run,
  setupRepoWithConfig,
  writeFile,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

interface BreakingChange {
  category: string;
  severity: string;
  path: string;
  message: string;
}

interface BreakingResult {
  contract: string;
  changes: BreakingChange[];
  summary: {
    breaking: number;
    nonBreaking: number;
    patch: number;
  };
}

interface BreakingOutput {
  hasBreaking: boolean;
  results: BreakingResult[];
}

describe('JSON Schema differ exhaustive tests', () => {
  let tempRepo: { dir: string; cleanup: () => void };

  beforeEach(() => {
    tempRepo = createTempRepo();
  });

  afterEach(() => {
    tempRepo.cleanup();
  });

  /**
   * Helper to set up a JSON Schema diff test scenario
   */
  function setupJsonSchemaDiff(baseFixture: string, currentFixture: string): void {
    const { dir } = tempRepo;

    setupRepoWithConfig(dir, [
      {
        name: 'order-schema',
        type: 'json-schema',
        path: 'schemas/order.json',
      },
    ]);

    // Set up base as snapshot (previous release)
    copyFixture(baseFixture, path.join(dir, '.contractual/snapshots/order-schema.json'));

    writeFile(
      dir,
      '.contractual/versions.json',
      JSON.stringify({
        'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
      })
    );

    // Set up current spec
    copyFixture(currentFixture, path.join(dir, 'schemas/order.json'));
  }

  describe('breaking changes (exit 1, major)', () => {
    test('field removed -> category: property-removed', () => {
      setupJsonSchemaDiff('json-schema/order-base.json', 'json-schema/order-field-removed.json');

      const result = run('breaking --format json', tempRepo.dir, { expectFail: true });
      expect(result.exitCode).toBe(1);

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(true);

      const changes = parsed.results[0].changes;
      const propertyRemovedChange = changes.find((c) => c.category === 'property-removed');
      expect(propertyRemovedChange).toBeDefined();
      expect(propertyRemovedChange!.severity).toBe('breaking');
      expect(propertyRemovedChange!.path).toContain('customer_email');
    });

    test('required added -> category: required-added', () => {
      setupJsonSchemaDiff('json-schema/order-base.json', 'json-schema/order-required-added.json');

      const result = run('breaking --format json', tempRepo.dir, { expectFail: true });
      expect(result.exitCode).toBe(1);

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(true);

      const changes = parsed.results[0].changes;
      const requiredAddedChange = changes.find((c) => c.category === 'required-added');
      expect(requiredAddedChange).toBeDefined();
      expect(requiredAddedChange!.severity).toBe('breaking');
      // The path is /required, but the field name appears in the message
      expect(requiredAddedChange!.path).toBe('/required');
      expect(requiredAddedChange!.message).toContain('customer_email');
    });

    test('type changed -> category: type-changed', () => {
      setupJsonSchemaDiff('json-schema/order-base.json', 'json-schema/order-type-changed.json');

      const result = run('breaking --format json', tempRepo.dir, { expectFail: true });
      expect(result.exitCode).toBe(1);

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(true);

      const changes = parsed.results[0].changes;
      const typeChangedChange = changes.find((c) => c.category === 'type-changed');
      expect(typeChangedChange).toBeDefined();
      expect(typeChangedChange!.severity).toBe('breaking');
      expect(typeChangedChange!.path).toContain('amount');
      expect(typeChangedChange!.message).toMatch(/string.*number|type/i);
    });

    test('enum value removed -> category: enum-value-removed', () => {
      setupJsonSchemaDiff(
        'json-schema/order-base.json',
        'json-schema/order-enum-value-removed.json'
      );

      const result = run('breaking --format json', tempRepo.dir, { expectFail: true });
      expect(result.exitCode).toBe(1);

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(true);

      const changes = parsed.results[0].changes;
      const enumRemovedChange = changes.find((c) => c.category === 'enum-value-removed');
      expect(enumRemovedChange).toBeDefined();
      expect(enumRemovedChange!.severity).toBe('breaking');
      expect(enumRemovedChange!.path).toContain('status');
      expect(enumRemovedChange!.message).toMatch(/delivered/i);
    });

    test('constraint tightened -> category: constraint-tightened', () => {
      setupJsonSchemaDiff(
        'json-schema/order-base.json',
        'json-schema/order-constraint-tightened.json'
      );

      const result = run('breaking --format json', tempRepo.dir, { expectFail: true });
      expect(result.exitCode).toBe(1);

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(true);

      const changes = parsed.results[0].changes;
      const constraintChange = changes.find((c) => c.category === 'constraint-tightened');
      expect(constraintChange).toBeDefined();
      expect(constraintChange!.severity).toBe('breaking');
      // Should detect maxLength reduction in zip (10 -> 5) or notes (500 -> 200)
      expect(constraintChange!.message).toMatch(/maxLength|constraint/i);
    });

    test('additionalProperties denied -> category: additional-properties-denied', () => {
      setupJsonSchemaDiff(
        'json-schema/order-base.json',
        'json-schema/order-additional-props-denied.json'
      );

      const result = run('breaking --format json', tempRepo.dir, { expectFail: true });
      expect(result.exitCode).toBe(1);

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(true);

      const changes = parsed.results[0].changes;
      const additionalPropsChange = changes.find(
        (c) => c.category === 'additional-properties-denied'
      );
      expect(additionalPropsChange).toBeDefined();
      expect(additionalPropsChange!.severity).toBe('breaking');
      expect(additionalPropsChange!.path).toContain('metadata');
    });
  });

  describe('non-breaking changes (exit 0, minor)', () => {
    test('optional field added -> category: property-added, severity: non-breaking', () => {
      setupJsonSchemaDiff(
        'json-schema/order-base.json',
        'json-schema/order-optional-field-added.json'
      );

      const result = run('breaking --format json', tempRepo.dir);
      expect(result.exitCode).toBe(0);

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(false);

      const changes = parsed.results[0].changes;
      const propertyAddedChange = changes.find((c) => c.category === 'property-added');
      expect(propertyAddedChange).toBeDefined();
      expect(propertyAddedChange!.severity).toBe('non-breaking');
      expect(propertyAddedChange!.path).toContain('tracking_number');

      // Summary should show non-breaking changes
      expect(parsed.results[0].summary.nonBreaking).toBeGreaterThan(0);
      expect(parsed.results[0].summary.breaking).toBe(0);
    });

    test('enum value added -> category: enum-value-added', () => {
      setupJsonSchemaDiff('json-schema/order-base.json', 'json-schema/order-enum-value-added.json');

      const result = run('breaking --format json', tempRepo.dir);
      expect(result.exitCode).toBe(0);

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(false);

      const changes = parsed.results[0].changes;
      const enumAddedChange = changes.find((c) => c.category === 'enum-value-added');
      expect(enumAddedChange).toBeDefined();
      expect(enumAddedChange!.severity).toBe('non-breaking');
      expect(enumAddedChange!.path).toContain('status');
      expect(enumAddedChange!.message).toMatch(/cancelled/i);
    });
  });

  describe('patch changes (exit 0, patch)', () => {
    test('description changed -> category: description-changed', () => {
      setupJsonSchemaDiff(
        'json-schema/order-base.json',
        'json-schema/order-description-changed.json'
      );

      const result = run('breaking --format json', tempRepo.dir);
      expect(result.exitCode).toBe(0);

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(false);

      const changes = parsed.results[0].changes;
      const descriptionChange = changes.find((c) => c.category === 'description-changed');
      expect(descriptionChange).toBeDefined();
      expect(descriptionChange!.severity).toBe('patch');

      // Summary should show patch changes
      expect(parsed.results[0].summary.patch).toBeGreaterThan(0);
      expect(parsed.results[0].summary.breaking).toBe(0);
    });
  });

  describe('no changes', () => {
    test('identical schema -> no changes detected', () => {
      setupJsonSchemaDiff('json-schema/order-base.json', 'json-schema/order-identical.json');

      const result = run('breaking --format json', tempRepo.dir);
      expect(result.exitCode).toBe(0);

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(false);
      expect(parsed.results[0].changes).toHaveLength(0);
      expect(parsed.results[0].summary.breaking).toBe(0);
      expect(parsed.results[0].summary.nonBreaking).toBe(0);
      expect(parsed.results[0].summary.patch).toBe(0);
    });
  });

  describe('multiple changes in single diff', () => {
    test('detects multiple breaking changes in one schema update', () => {
      const { dir } = tempRepo;

      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      // Use base as snapshot
      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/order-schema.json')
      );

      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Create a schema with multiple breaking changes
      const multiBreakingSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: 'https://example.com/order.schema.json',
        title: 'Order',
        description: 'An order in the system',
        type: 'object',
        properties: {
          id: {
            type: 'number', // Type changed from string
            description: 'Unique order identifier',
          },
          status: {
            type: 'string',
            enum: ['pending', 'processing'], // Removed 'shipped' and 'delivered'
            description: 'Current order status',
          },
          // 'amount' property removed
          currency: {
            type: 'string',
            format: 'iso-4217',
            description: 'Currency code (ISO 4217)',
          },
          items: {
            type: 'array',
            description: 'Line items in the order',
            items: {
              type: 'object',
              properties: {
                sku: { type: 'string' },
                quantity: { type: 'integer', minimum: 1 },
                price: { type: 'string' },
              },
              required: ['sku', 'quantity', 'price'],
            },
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            description: 'Order creation timestamp',
          },
        },
        required: ['id', 'status', 'currency', 'items', 'created_at', 'customer_email'], // Added required field
        additionalProperties: false,
      };

      writeFile(dir, 'schemas/order.json', JSON.stringify(multiBreakingSchema, null, 2));

      const result = run('breaking --format json', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(true);

      const changes = parsed.results[0].changes;
      const breakingChanges = changes.filter((c) => c.severity === 'breaking');

      // Should detect multiple breaking changes
      expect(breakingChanges.length).toBeGreaterThanOrEqual(2);

      // Check for specific categories
      const categories = breakingChanges.map((c) => c.category);
      expect(categories).toContain('type-changed');
      expect(
        categories.includes('enum-value-removed') || categories.includes('property-removed')
      ).toBe(true);
    });

    test('detects mix of breaking and non-breaking changes', () => {
      const { dir } = tempRepo;

      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/order-schema.json')
      );

      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Create a schema with both breaking and non-breaking changes
      const mixedChangesSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: 'https://example.com/order.schema.json',
        title: 'Order',
        description: 'An order in the e-commerce system', // Description changed (patch)
        type: 'object',
        properties: {
          id: {
            type: 'number', // Type changed (breaking)
            description: 'Unique order identifier',
          },
          status: {
            type: 'string',
            enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], // Added enum value (non-breaking)
            description: 'Current order status',
          },
          amount: {
            type: 'string',
            description: 'Order total amount as string',
          },
          currency: {
            type: 'string',
            format: 'iso-4217',
            description: 'Currency code (ISO 4217)',
          },
          items: {
            type: 'array',
            description: 'Line items in the order',
            items: {
              type: 'object',
              properties: {
                sku: { type: 'string' },
                quantity: { type: 'integer', minimum: 1 },
                price: { type: 'string' },
              },
              required: ['sku', 'quantity', 'price'],
            },
          },
          shipping_address: {
            type: 'object',
            description: 'Shipping address',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              zip: { type: 'string', maxLength: 10 },
              country: { type: 'string' },
            },
            required: ['street', 'city', 'zip', 'country'],
          },
          customer_email: {
            type: 'string',
            format: 'email',
            description: 'Customer email address',
          },
          notes: {
            type: 'string',
            description: 'Optional order notes',
            maxLength: 500,
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            description: 'Order creation timestamp',
          },
          metadata: {
            type: 'object',
            description: 'Additional metadata',
            additionalProperties: true,
          },
          tracking_number: {
            // New optional property (non-breaking)
            type: 'string',
            description: 'Shipment tracking number',
          },
        },
        required: ['id', 'status', 'amount', 'currency', 'items', 'created_at'],
        additionalProperties: false,
      };

      writeFile(dir, 'schemas/order.json', JSON.stringify(mixedChangesSchema, null, 2));

      const result = run('breaking --format json', dir, { expectFail: true });
      expect(result.exitCode).toBe(1); // Exit 1 because there are breaking changes

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(true);

      const { summary } = parsed.results[0];
      expect(summary.breaking).toBeGreaterThan(0);
      expect(summary.nonBreaking).toBeGreaterThan(0);
    });
  });

  describe('nested property changes', () => {
    test('detects changes in nested object properties', () => {
      const { dir } = tempRepo;

      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/order-schema.json')
      );

      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Create schema with nested property changes (shipping_address.zip maxLength changed)
      const nestedChangeSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: 'https://example.com/order.schema.json',
        title: 'Order',
        description: 'An order in the system',
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique order identifier' },
          status: {
            type: 'string',
            enum: ['pending', 'processing', 'shipped', 'delivered'],
            description: 'Current order status',
          },
          amount: { type: 'string', description: 'Order total amount as string' },
          currency: {
            type: 'string',
            format: 'iso-4217',
            description: 'Currency code (ISO 4217)',
          },
          items: {
            type: 'array',
            description: 'Line items in the order',
            items: {
              type: 'object',
              properties: {
                sku: { type: 'string' },
                quantity: { type: 'integer', minimum: 1 },
                price: { type: 'string' },
              },
              required: ['sku', 'quantity', 'price'],
            },
          },
          shipping_address: {
            type: 'object',
            description: 'Shipping address',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              zip: { type: 'string', maxLength: 5 }, // Changed from 10 to 5 (breaking)
              country: { type: 'string' },
            },
            required: ['street', 'city', 'zip', 'country'],
          },
          customer_email: {
            type: 'string',
            format: 'email',
            description: 'Customer email address',
          },
          notes: { type: 'string', description: 'Optional order notes', maxLength: 500 },
          created_at: {
            type: 'string',
            format: 'date-time',
            description: 'Order creation timestamp',
          },
          metadata: {
            type: 'object',
            description: 'Additional metadata',
            additionalProperties: true,
          },
        },
        required: ['id', 'status', 'amount', 'currency', 'items', 'created_at'],
        additionalProperties: false,
      };

      writeFile(dir, 'schemas/order.json', JSON.stringify(nestedChangeSchema, null, 2));

      const result = run('breaking --format json', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(true);

      const changes = parsed.results[0].changes;
      const constraintChange = changes.find((c) => c.category === 'constraint-tightened');
      expect(constraintChange).toBeDefined();
      expect(constraintChange!.path).toContain('shipping_address');
      expect(constraintChange!.path).toContain('zip');
    });

    test('detects changes in array item schema', () => {
      const { dir } = tempRepo;

      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/order-schema.json')
      );

      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Create schema with array item changes (items[].sku type changed)
      const arrayItemChangeSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: 'https://example.com/order.schema.json',
        title: 'Order',
        description: 'An order in the system',
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique order identifier' },
          status: {
            type: 'string',
            enum: ['pending', 'processing', 'shipped', 'delivered'],
            description: 'Current order status',
          },
          amount: { type: 'string', description: 'Order total amount as string' },
          currency: {
            type: 'string',
            format: 'iso-4217',
            description: 'Currency code (ISO 4217)',
          },
          items: {
            type: 'array',
            description: 'Line items in the order',
            items: {
              type: 'object',
              properties: {
                sku: { type: 'number' }, // Changed from string to number (breaking)
                quantity: { type: 'integer', minimum: 1 },
                price: { type: 'string' },
              },
              required: ['sku', 'quantity', 'price'],
            },
          },
          shipping_address: {
            type: 'object',
            description: 'Shipping address',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              zip: { type: 'string', maxLength: 10 },
              country: { type: 'string' },
            },
            required: ['street', 'city', 'zip', 'country'],
          },
          customer_email: {
            type: 'string',
            format: 'email',
            description: 'Customer email address',
          },
          notes: { type: 'string', description: 'Optional order notes', maxLength: 500 },
          created_at: {
            type: 'string',
            format: 'date-time',
            description: 'Order creation timestamp',
          },
          metadata: {
            type: 'object',
            description: 'Additional metadata',
            additionalProperties: true,
          },
        },
        required: ['id', 'status', 'amount', 'currency', 'items', 'created_at'],
        additionalProperties: false,
      };

      writeFile(dir, 'schemas/order.json', JSON.stringify(arrayItemChangeSchema, null, 2));

      const result = run('breaking --format json', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);

      const parsed: BreakingOutput = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(true);

      const changes = parsed.results[0].changes;
      const typeChange = changes.find((c) => c.category === 'type-changed');
      expect(typeChange).toBeDefined();
      expect(typeChange!.path).toContain('items');
      expect(typeChange!.path).toContain('sku');
    });
  });

  describe('edge cases', () => {
    test('handles first version (no snapshot)', () => {
      const { dir } = tempRepo;

      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
        },
      ]);

      // No snapshot exists - first version
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

      const result = run('breaking --format json', dir);
      expect(result.exitCode).toBe(0);

      const parsed = JSON.parse(result.stdout);
      expect(parsed.hasBreaking).toBe(false);
      // First version with no snapshot shows the contract with no changes
      if (parsed.results.length > 0) {
        expect(parsed.results[0].changes).toHaveLength(0);
      }
    });

    test('handles contract with breaking detection disabled', () => {
      const { dir } = tempRepo;

      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
          breaking: false,
        },
      ]);

      copyFixture(
        'json-schema/order-base.json',
        path.join(dir, '.contractual/snapshots/order-schema.json')
      );

      writeFile(
        dir,
        '.contractual/versions.json',
        JSON.stringify({
          'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        })
      );

      // Even with breaking changes, should pass because breaking detection is disabled
      copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));

      const result = run('breaking', dir);
      expect(result.exitCode).toBe(0);
      // When breaking detection is disabled, shows "No changes detected"
      expect(result.stdout).toMatch(/no changes detected/i);
    });
  });
});

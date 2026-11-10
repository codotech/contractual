import { describe, test, expect, beforeAll } from 'vitest';
import path from 'node:path';
import {
  createTempRepo,
  copyFixture,
  run,
  setupRepoWithConfig,
  writeFile,
  readFile,
  readJSON,
  readYAML,
  fileExists,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('contractual contract', () => {
  describe('contract add', () => {
    test('adds contract to existing config', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Initialize with one contract
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

        // Add a new spec file
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/user.json'));

        // Add contract using CLI
        const result = run(
          'contract add --name user-schema --type json-schema --path schemas/user.json --initial-version 0.0.0 -y',
          dir
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/added.*user-schema/i);

        // Verify config was updated
        const config = readYAML(dir, 'contractual.yaml') as {
          contracts: Array<{ name: string; type: string; path: string }>;
        };
        expect(config.contracts).toHaveLength(2);
        expect(config.contracts.find((c) => c.name === 'user-schema')).toBeDefined();
      } finally {
        cleanup();
      }
    });

    test('creates snapshot and updates versions.json', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        // Add new contract
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/new-api.json'));

        const result = run(
          'contract add --name new-api --type json-schema --path schemas/new-api.json --initial-version 0.5.0 -y',
          dir
        );

        expect(result.exitCode).toBe(0);

        // Verify snapshot created
        expect(fileExists(dir, '.contractual/snapshots/new-api.json')).toBe(true);

        // Verify versions.json updated
        const versions = readJSON(dir, '.contractual/versions.json') as Record<
          string,
          { version: string }
        >;
        expect(versions['new-api'].version).toBe('0.5.0');
        expect(versions['order-schema'].version).toBe('1.0.0');
      } finally {
        cleanup();
      }
    });

    test('validates spec file type', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

        // Create a non-matching spec file (JSON Schema file but claim it's OpenAPI)
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/fake-api.json'));

        const result = run(
          'contract add --name fake-api --type openapi --path schemas/fake-api.json -y',
          dir,
          { expectFail: true }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toMatch(/type mismatch|invalid|detected/i);
      } finally {
        cleanup();
      }
    });

    test('--skip-validation bypasses type check', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

        // Create file
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/custom.json'));

        const result = run(
          'contract add --name custom-api --type openapi --path schemas/custom.json --skip-validation -y',
          dir
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/added.*custom-api/i);
      } finally {
        cleanup();
      }
    });

    test('fails if not initialized', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // No contractual.yaml

        const result = run(
          'contract add --name test --type json-schema --path test.json -y',
          dir,
          { expectFail: true }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stdout + result.stderr).toMatch(/not initialized|init/i);
      } finally {
        cleanup();
      }
    });

    test('fails if contract name already exists', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

        // Try to add with same name
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/other.json'));

        const result = run(
          'contract add --name order-schema --type json-schema --path schemas/other.json -y',
          dir,
          { expectFail: true }
        );

        expect(result.exitCode).toBe(1);
        expect(result.stdout + result.stderr).toMatch(/contract exists|already defined|duplicate/i);
      } finally {
        cleanup();
      }
    });
  });

  describe('contract list', () => {
    test('lists all contracts', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
          {
            name: 'user-api',
            type: 'openapi',
            path: 'specs/user.yaml',
          },
        ]);
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/user.yaml'));

        const result = run('contract list', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/order-schema/);
        expect(result.stdout).toMatch(/user-api/);
        expect(result.stdout).toMatch(/json-schema/);
        expect(result.stdout).toMatch(/openapi/);
      } finally {
        cleanup();
      }
    });

    test('filters by exact name', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
          {
            name: 'user-schema',
            type: 'json-schema',
            path: 'schemas/user.json',
          },
          {
            name: 'product-api',
            type: 'openapi',
            path: 'specs/product.yaml',
          },
        ]);
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/user.json'));
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/product.yaml'));

        const result = run('contract list order-schema', dir);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toMatch(/order-schema/);
        expect(result.stdout).not.toMatch(/user-schema/);
        expect(result.stdout).not.toMatch(/product-api/);
      } finally {
        cleanup();
      }
    });

    test('--json outputs structured JSON', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'order-schema',
            type: 'json-schema',
            path: 'schemas/order.json',
          },
        ]);
        copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

        const result = run('contract list --json', dir);

        expect(result.exitCode).toBe(0);

        const output = JSON.parse(result.stdout);
        expect(Array.isArray(output)).toBe(true);
        expect(output[0].name).toBe('order-schema');
        expect(output[0].type).toBe('json-schema');
      } finally {
        cleanup();
      }
    });

    test('shows message when no contracts (schema requires at least one)', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Schema validation requires at least one contract, so empty array fails
        writeFile(dir, 'contractual.yaml', 'contracts: []\n');

        const result = run('contract list', dir, { expectFail: true });

        // Schema validation fails on empty contracts array
        expect(result.exitCode).toBeGreaterThan(0);
        expect(result.stdout + result.stderr).toMatch(/must NOT have fewer than 1 items|invalid|contracts/i);
      } finally {
        cleanup();
      }
    });
  });
});

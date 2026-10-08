import { describe, test, expect, beforeAll } from 'vitest';
import path from 'node:path';
import {
  createTempRepo,
  copyFixture,
  run,
  fileExists,
  readYAML,
  readJSON,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('contractual init', () => {
  test('detects OpenAPI spec and scaffolds config', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api.openapi.yaml'));

      const result = run('init', dir);

      // Assert: config created
      expect(fileExists(dir, 'contractual.yaml')).toBe(true);
      const config = readYAML(dir, 'contractual.yaml') as { contracts: Array<{ type: string; path: string }> };
      expect(config.contracts).toHaveLength(1);
      expect(config.contracts[0].type).toBe('openapi');
      expect(config.contracts[0].path).toContain('api.openapi.yaml');

      // Assert: .contractual directory created
      expect(fileExists(dir, '.contractual/versions.json')).toBe(true);
      expect(fileExists(dir, '.contractual/changesets')).toBe(true);
      expect(fileExists(dir, '.contractual/snapshots')).toBe(true);

      // Assert: versions.json is populated with initial version
      const versions = readJSON(dir, '.contractual/versions.json') as Record<string, { version: string }>;
      const contractName = Object.keys(versions)[0];
      expect(contractName).toBeDefined();
      expect(versions[contractName].version).toBe('0.0.0');

      // Assert: stdout confirms detection
      expect(result.stdout).toMatch(/found|detected|initialized/i);
    } finally {
      cleanup();
    }
  });

  test('detects JSON Schema by extension', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.schema.json'));

      run('init', dir);

      const config = readYAML(dir, 'contractual.yaml') as { contracts: Array<{ type: string }> };
      expect(config.contracts).toHaveLength(1);
      expect(config.contracts[0].type).toBe('json-schema');
    } finally {
      cleanup();
    }
  });

  test('detects multiple spec types in one repo', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api.openapi.yaml'));
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.schema.json'));

      run('init', dir);

      const config = readYAML(dir, 'contractual.yaml') as { contracts: Array<{ type: string }> };
      expect(config.contracts).toHaveLength(2);

      const types = config.contracts.map((c) => c.type).sort();
      expect(types).toEqual(['json-schema', 'openapi']);
    } finally {
      cleanup();
    }
  });

  test('handles already initialized gracefully', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api.openapi.yaml'));

      run('init', dir);

      // Second init should succeed with informational message (use --force to reinitialize)
      const result = run('init', dir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout + result.stderr).toMatch(/already initialized|all contracts have snapshots/i);
    } finally {
      cleanup();
    }
  });

  test('handles repo with no specs', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      const result = run('init', dir);

      // Should still complete (maybe with a warning)
      expect(result.exitCode).toBe(0);

      // Config may or may not be created with empty contracts
      if (fileExists(dir, 'contractual.yaml')) {
        const config = readYAML(dir, 'contractual.yaml') as { contracts: Array<unknown> };
        expect(config.contracts).toHaveLength(0);
      }
    } finally {
      cleanup();
    }
  });

  test('uses parent directory name for generic spec names', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      // Use "openapi.yaml" (generic name) in "orders" directory
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'orders/openapi.yaml'));

      run('init', dir);

      const config = readYAML(dir, 'contractual.yaml') as { contracts: Array<{ name: string }> };
      expect(config.contracts).toHaveLength(1);
      // Should use "orders" as the name, not "openapi"
      expect(config.contracts[0].name).toBe('orders');
    } finally {
      cleanup();
    }
  });
});

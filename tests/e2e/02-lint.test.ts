import { describe, test, expect, beforeAll } from 'vitest';
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

describe('contractual lint', () => {
  // Note: No built-in linters are registered yet in linterRegistry.
  // All contracts are skipped with "no linter available for {type}" message.
  // These tests verify the CLI handles this gracefully (exit 0, no errors).

  test('OpenAPI spec linted with Spectral returns errors for petstore fixture', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'petstore',
          type: 'openapi',
          path: 'specs/petstore.yaml',
        },
      ]);
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

      // OpenAPI linter (Spectral) is registered and finds errors in petstore fixture
      const result = run('lint --format json', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.results).toHaveLength(1);
      expect(parsed.results[0].errors.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  test('JSON Schema without registered linter exits successfully', () => {
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

      // No linter registered = contract is skipped, exit 0
      const result = run('lint', dir);
      expect(result.exitCode).toBe(0);
    } finally {
      cleanup();
    }
  });

  // Skip: No linters are registered, so invalid schemas cannot be validated
  test.skip('lint reports errors for invalid JSON Schema and exits 1', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'bad-schema',
          type: 'json-schema',
          path: 'schemas/bad.json',
        },
      ]);
      // Write an intentionally invalid JSON Schema
      writeFile(
        dir,
        'schemas/bad.json',
        JSON.stringify({
          type: 'objekt', // typo - invalid type value
          properties: {
            id: { type: 123 }, // type should be string, not number
          },
        })
      );

      const result = run('lint', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toMatch(/error/i);
    } finally {
      cleanup();
    }
  });

  test('lint --format json outputs valid JSON', () => {
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

      const result = run('lint --format json', dir);
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toHaveProperty('results');
      expect(Array.isArray(parsed.results)).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('lint with disabled linter skips contract', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        {
          name: 'order-schema',
          type: 'json-schema',
          path: 'schemas/order.json',
          lint: false,
        },
      ]);
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

      // With --format json, disabled contracts are not included in results
      const result = run('lint --format json', dir);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      // Results should be empty since contract is disabled
      expect(parsed.results).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  test('lint --contract filters to single contract', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        { name: 'api', type: 'openapi', path: 'specs/api.yaml' },
        { name: 'schema', type: 'json-schema', path: 'schemas/order.json' },
      ]);
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api.yaml'));
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

      // OpenAPI linter runs for 'api' contract, petstore has lint errors
      const result = run('lint --contract api --format json', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);
      const parsed = JSON.parse(result.stdout);
      // Should have exactly 1 result (the filtered 'api' contract)
      expect(parsed.results).toHaveLength(1);
      expect(parsed.results[0].contract).toBe('api');
    } finally {
      cleanup();
    }
  });

  test('lint reports error for non-existent contract name', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      setupRepoWithConfig(dir, [
        { name: 'api', type: 'openapi', path: 'specs/api.yaml' },
      ]);
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api.yaml'));

      const result = run('lint --contract nonexistent', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toMatch(/not found/i);
    } finally {
      cleanup();
    }
  });

  test('lint fails with empty contracts array due to schema validation', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      // Config schema requires minItems: 1 for contracts array
      setupRepoWithConfig(dir, []);

      const result = run('lint', dir, { expectFail: true });
      expect(result.exitCode).toBe(1);
      // Should fail config validation
      expect(result.stdout + result.stderr).toMatch(/contracts|validation|invalid/i);
    } finally {
      cleanup();
    }
  });
});

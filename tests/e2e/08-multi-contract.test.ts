import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import {
  createTempRepo,
  copyFixture,
  run,
  setupRepoWithConfig,
  writeFile,
  readFile,
  readJSON,
  fileExists,
  listFiles,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('multi-contract scenarios', () => {
  let tempRepo: { dir: string; cleanup: () => void };

  beforeEach(() => {
    tempRepo = createTempRepo();
  });

  afterEach(() => {
    tempRepo.cleanup();
  });

  test('lint works with multiple contracts of different types', () => {
    const { dir } = tempRepo;

    setupRepoWithConfig(dir, [
      { name: 'petstore-api', type: 'openapi', path: 'specs/petstore.yaml' },
      { name: 'order-schema', type: 'json-schema', path: 'schemas/order.json' },
      { name: 'user-schema', type: 'json-schema', path: 'schemas/user.json' },
    ]);

    copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));
    copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));
    copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/user.json'));

    // OpenAPI linter (Spectral) runs and finds errors in petstore fixture
    // JSON Schema linter validates and passes for valid schemas
    const result = run('lint --format json', dir, { expectFail: true });
    expect(result.exitCode).toBe(1); // petstore has lint errors

    const parsed = JSON.parse(result.stdout);
    // All 3 contracts have results
    expect(parsed.results).toHaveLength(3);
    // petstore has errors, JSON schemas pass
    const petstoreResult = parsed.results.find((r: { contract: string }) => r.contract === 'petstore-api');
    expect(petstoreResult.errors.length).toBeGreaterThan(0);
  });

  test('breaking detects changes in multiple contracts', () => {
    const { dir } = tempRepo;

    // Use only json-schema contracts for reliable testing
    // (openapi requires oasdiff binary which may not be available)
    setupRepoWithConfig(dir, [
      { name: 'order-schema', type: 'json-schema', path: 'schemas/order.json' },
      { name: 'user-schema', type: 'json-schema', path: 'schemas/user.json' },
    ]);

    // Set up snapshots for json-schema contracts
    copyFixture(
      'json-schema/order-base.json',
      path.join(dir, '.contractual/snapshots/order-schema.json')
    );
    copyFixture(
      'json-schema/order-base.json',
      path.join(dir, '.contractual/snapshots/user-schema.json')
    );

    writeFile(
      dir,
      '.contractual/versions.json',
      JSON.stringify({
        'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        'user-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
      })
    );

    // Current specs: breaking change in order-schema, no change in user
    copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));
    copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/user.json'));

    const result = run('breaking --format json', dir, { expectFail: true });
    expect(result.exitCode).toBe(1);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.hasBreaking).toBe(true);
    expect(parsed.results).toHaveLength(2);

    // Find results by contract name
    const orderResult = parsed.results.find(
      (r: { contract: string }) => r.contract === 'order-schema'
    );
    const userResult = parsed.results.find(
      (r: { contract: string }) => r.contract === 'user-schema'
    );

    expect(orderResult.summary.breaking).toBeGreaterThan(0);
    expect(userResult.summary.breaking).toBe(0);
    expect(userResult.summary.nonBreaking).toBe(0);
  });

  test('changeset includes all changed contracts', () => {
    const { dir } = tempRepo;

    // Use only json-schema contracts since openapi requires oasdiff binary
    setupRepoWithConfig(dir, [
      { name: 'order-schema', type: 'json-schema', path: 'schemas/order.json' },
      { name: 'user-schema', type: 'json-schema', path: 'schemas/user.json' },
    ]);

    // Set up snapshots
    copyFixture(
      'json-schema/order-base.json',
      path.join(dir, '.contractual/snapshots/order-schema.json')
    );
    copyFixture(
      'json-schema/order-base.json',
      path.join(dir, '.contractual/snapshots/user-schema.json')
    );

    writeFile(
      dir,
      '.contractual/versions.json',
      JSON.stringify({
        'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        'user-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
      })
    );

    // Current specs with changes - only order-schema changed
    copyFixture(
      'json-schema/order-optional-field-added.json',
      path.join(dir, 'schemas/order.json')
    );
    copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/user.json')); // No change

    const result = run('changeset', dir);
    expect(result.exitCode).toBe(0);

    // Check that changeset file was created
    const changesetFiles = listFiles(dir, '.contractual/changesets').filter(f => f.endsWith('.md'));
    expect(changesetFiles.length).toBeGreaterThan(0);

    // Read the changeset file (markdown with YAML frontmatter)
    const changesetPath = `.contractual/changesets/${changesetFiles[0]}`;
    const changesetContent = readFile(dir, changesetPath);

    // Changeset should include order-schema (which changed)
    expect(changesetContent).toContain('order-schema');
    // user-schema should not be included (no changes)
    expect(changesetContent).not.toContain('user-schema');
  });

  test('version bumps multiple contracts independently', () => {
    const { dir } = tempRepo;

    setupRepoWithConfig(dir, [
      { name: 'order-schema', type: 'json-schema', path: 'schemas/order.json' },
      { name: 'user-schema', type: 'json-schema', path: 'schemas/user.json' },
    ]);

    // Current specs
    copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));
    copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/user.json'));

    // Set up existing versions
    writeFile(
      dir,
      '.contractual/versions.json',
      JSON.stringify({
        'order-schema': { version: '2.0.0', released: '2026-01-01T00:00:00Z' },
        'user-schema': { version: '1.0.5', released: '2026-01-01T00:00:00Z' },
      })
    );

    // Create a changeset with different bump types - using markdown format with YAML frontmatter
    const changesetId = `changeset-${Date.now()}`;
    writeFile(
      dir,
      `.contractual/changesets/${changesetId}.md`,
      `---
"order-schema": major
"user-schema": patch
---

Multiple contracts bumped independently
`
    );

    // Run version command
    const result = run('version', dir);
    expect(result.exitCode).toBe(0);

    // Check versions were bumped correctly
    const versions = readJSON(dir, '.contractual/versions.json') as Record<
      string,
      { version: string }
    >;

    expect(versions['order-schema'].version).toBe('3.0.0'); // major bump: 2.0.0 -> 3.0.0
    expect(versions['user-schema'].version).toBe('1.0.6'); // patch bump: 1.0.5 -> 1.0.6

    // Verify snapshots were updated
    expect(fileExists(dir, '.contractual/snapshots/order-schema.json')).toBe(true);
    expect(fileExists(dir, '.contractual/snapshots/user-schema.json')).toBe(true);

    // Changeset should be consumed (removed)
    expect(fileExists(dir, `.contractual/changesets/${changesetId}.md`)).toBe(false);
  });

  test('lint reports errors for invalid specs', () => {
    const { dir } = tempRepo;

    // Use lint: false for OpenAPI to avoid petstore errors, focus on JSON Schema validation
    setupRepoWithConfig(dir, [
      { name: 'valid-api', type: 'openapi', path: 'specs/valid.yaml', lint: false },
      { name: 'invalid-schema', type: 'json-schema', path: 'schemas/invalid.json' },
      { name: 'another-valid', type: 'json-schema', path: 'schemas/valid.json' },
    ]);

    copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/valid.yaml'));
    copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/valid.json'));
    // Write invalid JSON Schema
    writeFile(
      dir,
      'schemas/invalid.json',
      JSON.stringify({
        type: 'objekt', // Invalid type value
        properties: {
          id: { type: 123 }, // type should be string
        },
      })
    );

    // JSON Schema linter finds errors in invalid-schema, so exit code is 1
    const result = run('lint --format json', dir, { expectFail: true });
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    // Should have 2 results (JSON Schema contracts only, OpenAPI has lint: false)
    expect(parsed.results).toHaveLength(2);
    // invalid-schema should have errors
    const invalidResult = parsed.results.find((r: { contract: string }) => r.contract === 'invalid-schema');
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  test('breaking --contract filters to single contract in multi-contract repo', () => {
    const { dir } = tempRepo;

    setupRepoWithConfig(dir, [
      { name: 'petstore-api', type: 'openapi', path: 'specs/petstore.yaml' },
      { name: 'order-schema', type: 'json-schema', path: 'schemas/order.json' },
    ]);

    // Set up snapshots
    copyFixture(
      'openapi/petstore-base.yaml',
      path.join(dir, '.contractual/snapshots/petstore-api.yaml')
    );
    copyFixture(
      'json-schema/order-base.json',
      path.join(dir, '.contractual/snapshots/order-schema.json')
    );

    writeFile(
      dir,
      '.contractual/versions.json',
      JSON.stringify({
        'petstore-api': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
        'order-schema': { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
      })
    );

    // Both have breaking changes
    copyFixture(
      'openapi/petstore-breaking-endpoint-removed.yaml',
      path.join(dir, 'specs/petstore.yaml')
    );
    copyFixture('json-schema/order-field-removed.json', path.join(dir, 'schemas/order.json'));

    // Filter to only check order-schema
    const result = run('breaking --contract order-schema --format json', dir, { expectFail: true });
    expect(result.exitCode).toBe(1);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].contract).toBe('order-schema');
    expect(parsed.results[0].summary.breaking).toBeGreaterThan(0);
  });

  test('status shows all contracts with their current versions', () => {
    const { dir } = tempRepo;

    setupRepoWithConfig(dir, [
      { name: 'petstore-api', type: 'openapi', path: 'specs/petstore.yaml' },
      { name: 'order-schema', type: 'json-schema', path: 'schemas/order.json' },
      { name: 'user-schema', type: 'json-schema', path: 'schemas/user.json' },
    ]);

    copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));
    copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));
    copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/user.json'));

    writeFile(
      dir,
      '.contractual/versions.json',
      JSON.stringify({
        'petstore-api': { version: '1.2.0', released: '2026-01-01T00:00:00Z' },
        'order-schema': { version: '2.0.0', released: '2026-01-01T00:00:00Z' },
        'user-schema': { version: '1.0.5', released: '2026-01-01T00:00:00Z' },
      })
    );

    // Status command only outputs text format (no --format json option)
    const result = run('status', dir);
    expect(result.exitCode).toBe(0);

    // Check for text output containing contract info
    expect(result.stdout).toMatch(/petstore-api/);
    expect(result.stdout).toMatch(/openapi/);
    expect(result.stdout).toMatch(/1\.2\.0/);

    expect(result.stdout).toMatch(/order-schema/);
    expect(result.stdout).toMatch(/json-schema/);
    expect(result.stdout).toMatch(/2\.0\.0/);

    expect(result.stdout).toMatch(/user-schema/);
    expect(result.stdout).toMatch(/1\.0\.5/);
  });
});

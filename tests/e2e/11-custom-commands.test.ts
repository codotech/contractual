import { describe, test, expect, beforeAll } from 'vitest';
import path from 'node:path';
import {
  createTempRepo,
  copyFixture,
  run,
  setupRepoWithConfig,
  writeFile,
  fileExists,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('custom command overrides', () => {
  describe('custom lint command', () => {
    test('uses custom lint command with {spec} placeholder', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Create a custom lint script that creates a marker file
        writeFile(
          dir,
          'custom-lint.sh',
          `#!/bin/bash
echo "Custom lint executed for: $1"
touch "${dir}/lint-marker.txt"
exit 0
`
        );

        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
            lint: `bash ${dir}/custom-lint.sh {spec}`,
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

        const result = run('lint', dir);
        expect(result.exitCode).toBe(0);
        // Custom command was executed - marker file should exist
        expect(fileExists(dir, 'lint-marker.txt')).toBe(true);
      } finally {
        cleanup();
      }
    });

    test('custom lint command without {spec} uses default linter', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // A lint override that doesn't contain {spec} falls through to default linter
        // The petstore fixture has lint errors, so the default linter will exit 1
        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
            lint: 'exit 1', // No {spec} - falls through to default linter
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

        // Default OpenAPI linter runs and finds errors in the petstore fixture
        const result = run('lint', dir, { expectFail: true });
        expect(result.exitCode).toBe(1);
        // Should show lint errors from the default linter
        expect(result.stdout).toMatch(/error/i);
      } finally {
        cleanup();
      }
    });

    test('lint: false disables linting for contract', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
            lint: false,
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

        const result = run('lint', dir);
        expect(result.exitCode).toBe(0);
        // Spinner output goes to TTY, not captured in stdout
        // JSON format shows empty results when linting is disabled
        const jsonResult = run('lint --format json', dir);
        const parsed = JSON.parse(jsonResult.stdout);
        expect(parsed.results).toHaveLength(0);
        expect(parsed.errors).toBe(0);
      } finally {
        cleanup();
      }
    });

    test('lint: false with invalid spec still passes (linting skipped)', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'bad-spec',
            type: 'openapi',
            path: 'specs/bad.yaml',
            lint: false,
          },
        ]);
        // Write intentionally invalid OpenAPI
        writeFile(
          dir,
          'specs/bad.yaml',
          `openapi: 3.0.0
info:
  title: Invalid
  # Missing version field - normally invalid
paths: []  # paths should be object, not array
`
        );

        const result = run('lint', dir);
        expect(result.exitCode).toBe(0);
        // Verify via JSON that the contract was skipped (not in results)
        const jsonResult = run('lint --format json', dir);
        const parsed = JSON.parse(jsonResult.stdout);
        expect(parsed.results).toHaveLength(0);
      } finally {
        cleanup();
      }
    });
  });

  describe('custom breaking command', () => {
    test('uses custom breaking command with {old} and {new} placeholders', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Create a custom breaking detection script
        writeFile(
          dir,
          'custom-breaking.sh',
          `#!/bin/bash
echo "Comparing old: $1 with new: $2"
touch "${dir}/breaking-marker.txt"
exit 0
`
        );

        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
            breaking: `bash ${dir}/custom-breaking.sh {old} {new}`,
          },
        ]);

        // Set up snapshot
        copyFixture(
          'openapi/petstore-base.yaml',
          path.join(dir, '.contractual/snapshots/petstore.yaml')
        );
        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );

        // Current spec with changes
        copyFixture(
          'openapi/petstore-nonbreaking-endpoint-added.yaml',
          path.join(dir, 'specs/petstore.yaml')
        );

        const result = run('breaking', dir);
        expect(result.exitCode).toBe(0);
        // Custom command was executed - marker file should exist
        expect(fileExists(dir, 'breaking-marker.txt')).toBe(true);
      } finally {
        cleanup();
      }
    });

    test('custom breaking command without placeholders uses default differ', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Custom command without {old} or {new} falls through to default differ
        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
            breaking: 'echo "Breaking change detected" && exit 1',
          },
        ]);

        // Set up snapshot
        copyFixture(
          'openapi/petstore-base.yaml',
          path.join(dir, '.contractual/snapshots/petstore.yaml')
        );
        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );
        // Same spec as snapshot - no changes, default differ will pass
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

        // Default differ runs - with identical specs, should pass (no breaking changes)
        const result = run('breaking', dir);
        expect(result.exitCode).toBe(0);
      } finally {
        cleanup();
      }
    });

    test('breaking: false disables breaking detection for contract', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
            breaking: false,
          },
        ]);

        // Set up snapshot with breaking change in current
        copyFixture(
          'openapi/petstore-base.yaml',
          path.join(dir, '.contractual/snapshots/petstore.yaml')
        );
        writeFile(
          dir,
          '.contractual/versions.json',
          JSON.stringify({
            petstore: { version: '1.0.0', released: '2026-01-01T00:00:00Z' },
          })
        );
        // Even with a breaking change, it should pass because breaking detection is disabled
        copyFixture(
          'openapi/petstore-breaking-endpoint-removed.yaml',
          path.join(dir, 'specs/petstore.yaml')
        );

        const result = run('breaking', dir);
        expect(result.exitCode).toBe(0);
        // When breaking detection is disabled, shows "No changes detected"
        expect(result.stdout).toMatch(/no changes detected/i);
      } finally {
        cleanup();
      }
    });
  });

  describe('mixed custom and default commands', () => {
    test('can mix custom lint with default breaking', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        // Custom lint command with {spec} - will be executed
        setupRepoWithConfig(dir, [
          {
            name: 'petstore',
            type: 'openapi',
            path: 'specs/petstore.yaml',
            lint: 'echo "Custom lint for {spec}" && exit 0',
            // No custom breaking - uses default
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/petstore.yaml'));

        // Custom lint command with {spec} runs and exits 0
        const lintResult = run('lint', dir);
        expect(lintResult.exitCode).toBe(0);

        // Default breaking (no snapshot) - exits 0
        const breakingResult = run('breaking', dir);
        expect(breakingResult.exitCode).toBe(0);
      } finally {
        cleanup();
      }
    });

    test('can have different settings per contract', () => {
      const { dir, cleanup } = createTempRepo();
      try {
        setupRepoWithConfig(dir, [
          {
            name: 'api-v1',
            type: 'openapi',
            path: 'specs/api-v1.yaml',
            lint: false, // Disable lint for v1
            breaking: false, // Disable breaking for v1
          },
          {
            name: 'api-v2',
            type: 'openapi',
            path: 'specs/api-v2.yaml',
            // Use defaults for v2 - will use default OpenAPI linter
          },
        ]);
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api-v1.yaml'));
        copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api-v2.yaml'));

        // The petstore fixture has lint errors, so api-v2 will cause exit 1
        const result = run('lint --format json', dir, { expectFail: true });
        expect(result.exitCode).toBe(1);
        const parsed = JSON.parse(result.stdout);

        // api-v1 is skipped (lint: false), api-v2 is linted with default linter
        expect(parsed.results).toHaveLength(1);
        expect(parsed.results[0].contract).toBe('api-v2');
        // api-v2 has lint errors from the petstore fixture
        expect(parsed.errors).toBeGreaterThan(0);
      } finally {
        cleanup();
      }
    });
  });
});

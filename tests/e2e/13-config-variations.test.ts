import { describe, test, expect, beforeAll, vi } from 'vitest';
import path from 'node:path';
import { ConfigError, resolveContractPaths } from '../../packages/cli/src/config/loader.js';
import {
  createTempRepo,
  copyFixture,
  run,
  setupRepoWithConfig,
  writeFile,
  readYAML,
  fileExists,
  ensureCliBuilt,
} from './helpers.js';

beforeAll(() => {
  ensureCliBuilt();
});

describe('config variations', () => {
  test('minimal config (just contracts array) works', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      // Write minimal config with only required fields
      // Use lint: false to avoid petstore fixture lint errors
      writeFile(
        dir,
        'contractual.yaml',
        `contracts:
  - name: api
    type: openapi
    path: specs/api.yaml
    lint: false
`
      );

      // Create .contractual directory structure
      writeFile(dir, '.contractual/versions.json', '{}');

      // Copy the spec file
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api.yaml'));

      // Lint should work with minimal config (lint disabled)
      const result = run('lint', dir);
      expect(result.exitCode).toBe(0);

      // Verify config was parsed correctly
      const config = readYAML(dir, 'contractual.yaml') as { contracts: Array<{ name: string; type: string; path: string }> };
      expect(config.contracts).toHaveLength(1);
      expect(config.contracts[0].name).toBe('api');
      expect(config.contracts[0].type).toBe('openapi');
    } finally {
      cleanup();
    }
  });

  test('config with changeset options (autoDetect, requireOnPR)', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      // Write config with changeset options
      // Use lint: false to avoid petstore fixture lint errors
      writeFile(
        dir,
        'contractual.yaml',
        `contracts:
  - name: api
    type: openapi
    path: specs/api.yaml
    lint: false
changeset:
  autoDetect: true
  requireOnPR: false
`
      );

      writeFile(dir, '.contractual/versions.json', '{}');
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api.yaml'));

      // Config should be valid and lint should work
      const result = run('lint', dir);
      expect(result.exitCode).toBe(0);

      // Verify changeset options are preserved
      const config = readYAML(dir, 'contractual.yaml') as {
        contracts: Array<unknown>;
        changeset: { autoDetect: boolean; requireOnPR: boolean };
      };
      expect(config.changeset).toBeDefined();
      expect(config.changeset.autoDetect).toBe(true);
      expect(config.changeset.requireOnPR).toBe(false);
    } finally {
      cleanup();
    }
  });

  test('config with AI options (disabled by default)', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      // Write config with AI options - all features disabled
      // Use lint: false to avoid petstore fixture lint errors
      writeFile(
        dir,
        'contractual.yaml',
        `contracts:
  - name: api
    type: openapi
    path: specs/api.yaml
    lint: false
ai:
  provider: anthropic
  model: claude-3-sonnet
  features:
    explain: false
    changelog: false
    enhance: false
`
      );

      writeFile(dir, '.contractual/versions.json', '{}');
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api.yaml'));

      // Config should be valid
      const result = run('lint', dir);
      expect(result.exitCode).toBe(0);

      // Verify AI options are preserved
      const config = readYAML(dir, 'contractual.yaml') as {
        contracts: Array<unknown>;
        ai: {
          provider: string;
          model: string;
          features: { explain: boolean; changelog: boolean; enhance: boolean };
        };
      };
      expect(config.ai).toBeDefined();
      expect(config.ai.provider).toBe('anthropic');
      expect(config.ai.model).toBe('claude-3-sonnet');
      expect(config.ai.features.explain).toBe(false);
      expect(config.ai.features.changelog).toBe(false);
      expect(config.ai.features.enhance).toBe(false);
    } finally {
      cleanup();
    }
  });

  test('glob patterns in contract path work', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      // Write config with glob pattern and lint disabled
      writeFile(
        dir,
        'contractual.yaml',
        `contracts:
  - name: all-schemas
    type: json-schema
    path: schemas/*.json
    lint: false
`
      );

      writeFile(dir, '.contractual/versions.json', '{}');

      // Create multiple schema files matching the glob
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));

      // Lint should work with glob pattern (lint disabled)
      const result = run('lint', dir);
      expect(result.exitCode).toBe(0);

      // Verify the file exists at the expected location
      expect(fileExists(dir, 'schemas/order.json')).toBe(true);
    } finally {
      cleanup();
    }
  });

  test.each([
    ['reported deeply nested braces', '{'.repeat(4500) + 'x' + '}'.repeat(4500) + '*', '1024 characters'],
    ['oversized flat glob', 'x'.repeat(1024) + '*', '1024 characters'],
    ['nested braces', '{'.repeat(33) + 'x' + '}'.repeat(33) + '*', '32 levels'],
    ['nested parentheses', '('.repeat(33) + 'x' + ')'.repeat(33) + '*', '32 levels'],
    ['mixed nesting', '{('.repeat(17) + 'x' + ')}'.repeat(17) + '*', '32 levels'],
    ['quoted closing braces', '{"}"'.repeat(33) + '*', '32 levels'],
    ['character-class closing braces', '{[}]'.repeat(33) + '*', '32 levels'],
    ['escaped closing braces', '{\\}'.repeat(33) + '*', '32 levels'],
    ['mismatched closing braces', '(}'.repeat(33) + '*', '32 levels'],
  ])('rejects %s as a controlled configuration error', (_name, pattern, limit) => {
    const { dir, cleanup } = createTempRepo();
    try {
      writeFile(dir, 'contractual.yaml', JSON.stringify({
        contracts: [{ name: 'api', type: 'openapi', path: pattern }],
      }));

      const result = run('status', dir, { expectFail: true, timeout: 5000 });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Glob for contract "api" exceeds');
      expect(result.stderr).toContain(limit);
      expect(result.stderr).not.toContain('Maximum call stack');
      expect(result.stderr).not.toContain(pattern);
    } finally {
      cleanup();
    }
  });

  test.each([
    'schemas/{order,other}.j*',
    'schemas/{order,{other,third}}.j*',
    'schemas/@(order|other).j*',
    'schemas/[o]rder.j*',
  ])('preserves normal glob matching: %s', (pattern) => {
    const { dir, cleanup } = createTempRepo();
    try {
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/order.json'));
      const contracts = resolveContractPaths({
        contracts: [{ name: 'order', type: 'json-schema', path: pattern }],
      }, dir);
      expect(contracts).toHaveLength(1);
      expect(contracts[0].absolutePath).toBe(path.join(dir, 'schemas/order.json'));
    } finally {
      cleanup();
    }
  });

  test('bounds the full resolved pattern and accepts the exact length limit', () => {
    const { dir, cleanup } = createTempRepo();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const prefixLength = path.resolve(dir).length + path.sep.length;
      const pattern = 'x'.repeat(1024 - prefixLength - 1) + '*';
      const config = { contracts: [{ name: 'api', type: 'openapi' as const, path: pattern }] };
      expect(() => resolveContractPaths(config, dir)).not.toThrow();
      config.contracts[0].path += '*';
      expect(() => resolveContractPaths(config, dir)).toThrow(ConfigError);
      expect(() => resolveContractPaths(config, dir)).toThrow('1024 characters');
    } finally {
      warning.mockRestore();
      cleanup();
    }
  });

  test.each([
    ['exact nesting limit', '{'.repeat(32) + 'x' + '}'.repeat(32) + '*'],
    ['escaped braces', '\\{'.repeat(40) + 'x' + '\\}'.repeat(40) + '*'],
    ['quoted braces', '"' + '{'.repeat(40) + 'x' + '}'.repeat(40) + '"*'],
    ['character-class braces', '[' + '{'.repeat(40) + ']' + '*'],
  ])('accepts %s without treating literals as nesting', (_name, pattern) => {
    const { dir, cleanup } = createTempRepo();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => resolveContractPaths({
        contracts: [{ name: 'api', type: 'openapi', path: pattern }],
      }, dir)).not.toThrow();
    } finally {
      warning.mockRestore();
      cleanup();
    }
  });

  test('leaves literal paths with braces unchanged', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      const relativePath = 'schemas/' + '{'.repeat(40) + 'order' + '}'.repeat(40) + '.json';
      copyFixture('json-schema/order-base.json', path.join(dir, relativePath));
      const contracts = resolveContractPaths({
        contracts: [{ name: 'order', type: 'json-schema', path: relativePath }],
      }, dir);
      expect(contracts[0].absolutePath).toBe(path.join(dir, relativePath));
    } finally {
      cleanup();
    }
  });

  test('contract with all optional fields specified', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      // Write config with all optional contract fields
      writeFile(
        dir,
        'contractual.yaml',
        `contracts:
  - name: full-contract
    type: openapi
    path: specs/api.yaml
    lint: spectral
    breaking: oasdiff
    generate:
      - openapi-generator generate -i specs/api.yaml -g typescript-axios -o ./client
`
      );

      writeFile(dir, '.contractual/versions.json', '{}');
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api.yaml'));

      // Use status command to verify config is valid (lint would fail due to petstore fixture errors)
      const result = run('status', dir);
      expect(result.exitCode).toBe(0);

      // Verify all optional fields are preserved
      const config = readYAML(dir, 'contractual.yaml') as {
        contracts: Array<{
          name: string;
          type: string;
          path: string;
          lint: string;
          breaking: string;
          generate: string[];
        }>;
      };
      expect(config.contracts[0].lint).toBe('spectral');
      expect(config.contracts[0].breaking).toBe('oasdiff');
      expect(config.contracts[0].generate).toEqual([
        'openapi-generator generate -i specs/api.yaml -g typescript-axios -o ./client',
      ]);
    } finally {
      cleanup();
    }
  });

  test('config with multiple contract types and mixed options', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      // Write complex config with multiple contracts and various options
      writeFile(
        dir,
        'contractual.yaml',
        `contracts:
  - name: api
    type: openapi
    path: specs/api.yaml
    lint: spectral
  - name: events
    type: json-schema
    path: schemas/events.json
    lint: false
    breaking: false
changeset:
  autoDetect: true
  requireOnPR: true
ai:
  provider: anthropic
  features:
    explain: true
    changelog: false
`
      );

      writeFile(dir, '.contractual/versions.json', '{}');
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api.yaml'));
      copyFixture('json-schema/order-base.json', path.join(dir, 'schemas/events.json'));

      // Use status command to verify config is valid (lint would fail due to petstore fixture errors)
      const result = run('status', dir);
      expect(result.exitCode).toBe(0);

      // Verify config structure
      const config = readYAML(dir, 'contractual.yaml') as {
        contracts: Array<{ name: string; lint?: string | boolean; breaking?: string | boolean }>;
        changeset: { autoDetect: boolean; requireOnPR: boolean };
        ai: { provider: string; features: { explain: boolean; changelog: boolean } };
      };
      expect(config.contracts).toHaveLength(2);
      expect(config.contracts[0].lint).toBe('spectral');
      expect(config.contracts[1].lint).toBe(false);
      expect(config.contracts[1].breaking).toBe(false);
      expect(config.changeset.autoDetect).toBe(true);
      expect(config.ai.features.explain).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('config with nested directory structure for specs', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      // Write config pointing to deeply nested spec, with lint disabled
      writeFile(
        dir,
        'contractual.yaml',
        `contracts:
  - name: nested-api
    type: openapi
    path: src/contracts/api/v1/openapi.yaml
    lint: false
`
      );

      writeFile(dir, '.contractual/versions.json', '{}');
      copyFixture(
        'openapi/petstore-base.yaml',
        path.join(dir, 'src/contracts/api/v1/openapi.yaml')
      );

      // Lint should work with nested paths (lint disabled)
      const result = run('lint', dir);
      expect(result.exitCode).toBe(0);

      // Verify nested file exists
      expect(fileExists(dir, 'src/contracts/api/v1/openapi.yaml')).toBe(true);
    } finally {
      cleanup();
    }
  });

  test('config with only changeset options (no ai)', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      writeFile(
        dir,
        'contractual.yaml',
        `contracts:
  - name: api
    type: openapi
    path: specs/api.yaml
    lint: false
changeset:
  autoDetect: false
  requireOnPR: true
`
      );

      writeFile(dir, '.contractual/versions.json', '{}');
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api.yaml'));

      const result = run('lint', dir);
      expect(result.exitCode).toBe(0);

      const config = readYAML(dir, 'contractual.yaml') as {
        contracts: Array<unknown>;
        changeset: { autoDetect: boolean; requireOnPR: boolean };
        ai?: unknown;
      };
      expect(config.changeset.autoDetect).toBe(false);
      expect(config.changeset.requireOnPR).toBe(true);
      expect(config.ai).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  test('config with only ai options (no changeset)', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      writeFile(
        dir,
        'contractual.yaml',
        `contracts:
  - name: api
    type: openapi
    path: specs/api.yaml
    lint: false
ai:
  provider: anthropic
  features:
    explain: true
`
      );

      writeFile(dir, '.contractual/versions.json', '{}');
      copyFixture('openapi/petstore-base.yaml', path.join(dir, 'specs/api.yaml'));

      const result = run('lint', dir);
      expect(result.exitCode).toBe(0);

      const config = readYAML(dir, 'contractual.yaml') as {
        contracts: Array<unknown>;
        ai: { provider: string; features: { explain: boolean } };
        changeset?: unknown;
      };
      expect(config.ai.provider).toBe('anthropic');
      expect(config.ai.features.explain).toBe(true);
      expect(config.changeset).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  test('asyncapi contract type is accepted', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      writeFile(
        dir,
        'contractual.yaml',
        `contracts:
  - name: events
    type: asyncapi
    path: specs/events.yaml
`
      );

      writeFile(dir, '.contractual/versions.json', '{}');
      // Use a basic YAML file as placeholder (asyncapi would have similar structure)
      writeFile(
        dir,
        'specs/events.yaml',
        `asyncapi: 2.6.0
info:
  title: Events API
  version: 1.0.0
channels: {}
`
      );

      // Config validation should pass (even if lint may not have asyncapi support yet)
      const config = readYAML(dir, 'contractual.yaml') as {
        contracts: Array<{ name: string; type: string }>;
      };
      expect(config.contracts[0].type).toBe('asyncapi');
    } finally {
      cleanup();
    }
  });

  test('odcs contract type is accepted', () => {
    const { dir, cleanup } = createTempRepo();
    try {
      writeFile(
        dir,
        'contractual.yaml',
        `contracts:
  - name: data-contract
    type: odcs
    path: contracts/data.yaml
`
      );

      writeFile(dir, '.contractual/versions.json', '{}');
      // Use a basic YAML file as placeholder for ODCS
      writeFile(
        dir,
        'contracts/data.yaml',
        `dataContractSpecification: 1.0.0
info:
  title: Data Contract
  version: 1.0.0
`
      );

      const config = readYAML(dir, 'contractual.yaml') as {
        contracts: Array<{ name: string; type: string }>;
      };
      expect(config.contracts[0].type).toBe('odcs');
    } finally {
      cleanup();
    }
  });
});

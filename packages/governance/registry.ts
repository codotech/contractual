/**
 * Governance Registry
 *
 * Central registry for linters and differs. CLI Core uses this to resolve
 * the correct engine for each contract type.
 */

import type { LintFn, DiffFn, ContractType } from '@contractual/types';

const linters = new Map<ContractType, LintFn>();
const differs = new Map<ContractType, DiffFn>();

/**
 * Register a linter for a contract type
 */
export function registerLinter(type: ContractType, linter: LintFn): void {
  linters.set(type, linter);
}

/**
 * Register a differ for a contract type
 */
export function registerDiffer(type: ContractType, differ: DiffFn): void {
  differs.set(type, differ);
}

/**
 * Get the linter for a contract type
 *
 * @param type - Contract type (openapi, json-schema, etc.)
 * @param override - Optional override: built-in name or custom command
 * @returns Linter function or null if not found
 */
export function getLinter(type: ContractType, override?: string | false): LintFn | null {
  // If override is explicitly false, disable linting
  if (override === false) {
    return null;
  }

  // If override is a custom command (contains {spec}), create custom executor
  if (override && override.includes('{spec}')) {
    return createCustomLinter(override);
  }

  // If override is a known built-in name, resolve it
  if (override) {
    const builtIn = resolveBuiltInLinter(override);
    if (builtIn) return builtIn;
  }

  // Return default for type
  return linters.get(type) ?? null;
}

/**
 * Get the differ for a contract type
 *
 * @param type - Contract type (openapi, json-schema, etc.)
 * @param override - Optional override: built-in name or custom command
 * @returns Differ function or null if not found
 */
export function getDiffer(type: ContractType, override?: string | false): DiffFn | null {
  // If override is explicitly false, disable diffing
  if (override === false) {
    return null;
  }

  // If override is a custom command (contains {old} or {new}), create custom executor
  if (override && (override.includes('{old}') || override.includes('{new}'))) {
    return createCustomDiffer(override);
  }

  // If override is a known built-in name, resolve it
  if (override) {
    const builtIn = resolveBuiltInDiffer(override);
    if (builtIn) return builtIn;
  }

  // Return default for type
  return differs.get(type) ?? null;
}

/**
 * Valid contract type values for type checking
 */
const VALID_CONTRACT_TYPES: readonly ContractType[] = [
  'openapi',
  'json-schema',
  'asyncapi',
  'odcs',
] as const;

/**
 * Type guard for ContractType
 */
function isContractType(value: string): value is ContractType {
  return VALID_CONTRACT_TYPES.includes(value as ContractType);
}

/**
 * Resolve a built-in linter by name
 */
function resolveBuiltInLinter(name: string): LintFn | null {
  // Check if name is a valid contract type
  if (isContractType(name)) {
    const linter = linters.get(name);
    if (linter) return linter;
  }

  // Special named overrides
  switch (name.toLowerCase()) {
    case 'redocly':
    case 'openapi-redocly':
      return linters.get('openapi') ?? null;
    case 'spectral':
      // Spectral is an alternative OpenAPI linter - could add support later
      return linters.get('openapi') ?? null;
    case 'ajv':
    case 'json-schema-ajv':
      return linters.get('json-schema') ?? null;
    default:
      return null;
  }
}

/**
 * Resolve a built-in differ by name
 */
function resolveBuiltInDiffer(name: string): DiffFn | null {
  // Check if name is a valid contract type
  if (isContractType(name)) {
    const differ = differs.get(name);
    if (differ) return differ;
  }

  // Special named overrides
  switch (name.toLowerCase()) {
    case 'oasdiff':
    case 'openapi-oasdiff':
      return differs.get('openapi') ?? null;
    case 'json-schema-differ':
      return differs.get('json-schema') ?? null;
    default:
      return null;
  }
}

/**
 * Create a custom linter from a command template
 */
function createCustomLinter(commandTemplate: string): LintFn {
  return async (specPath: string) => {
    const { executeCustomCommand, parseCustomLintOutput } = await import('./runner.js');
    const command = commandTemplate.replace('{spec}', specPath);
    const output = await executeCustomCommand(command);
    return parseCustomLintOutput(output);
  };
}

/**
 * Create a custom differ from a command template
 */
function createCustomDiffer(commandTemplate: string): DiffFn {
  return async (oldSpecPath: string, newSpecPath: string) => {
    const { executeCustomCommand, parseCustomDiffOutput } = await import('./runner.js');
    const command = commandTemplate.replace('{old}', oldSpecPath).replace('{new}', newSpecPath);
    const output = await executeCustomCommand(command);
    return parseCustomDiffOutput(output);
  };
}

/**
 * Check if a linter is registered for a contract type
 */
export function hasLinter(type: ContractType): boolean {
  return linters.has(type);
}

/**
 * Check if a differ is registered for a contract type
 */
export function hasDiffer(type: ContractType): boolean {
  return differs.has(type);
}

/**
 * Get all registered contract types for linting
 */
export function getRegisteredLinterTypes(): ContractType[] {
  return Array.from(linters.keys());
}

/**
 * Get all registered contract types for diffing
 */
export function getRegisteredDifferTypes(): ContractType[] {
  return Array.from(differs.keys());
}

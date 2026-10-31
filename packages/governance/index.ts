/**
 * Governance Engines
 *
 * Central module for all linting and diffing capabilities.
 * Registers all built-in engines with the registry at import time.
 */

import { registerLinter, registerDiffer } from './registry.js';
import { lintOpenAPI } from './linters/openapi-redocly.js';
import { lintJsonSchema } from './linters/json-schema-ajv.js';
import { diffOpenApi } from '@contractual/differs.openapi';
import { diffJsonSchema } from '@contractual/differs.json-schema';

// Re-export registry functions
export {
  registerLinter,
  registerDiffer,
  getLinter,
  getDiffer,
  hasLinter,
  hasDiffer,
  getRegisteredLinterTypes,
  getRegisteredDifferTypes,
} from './registry.js';

// Re-export types from @contractual/types
export type {
  Change,
  ChangeSeverity,
  DiffResult,
  DiffSummary,
  SuggestedBump,
  LintResult,
  LintIssue,
  LintSeverity,
  LintFn,
  DiffFn,
  ContractType,
  RawChange,
  ChangeType,
} from '@contractual/types';

// Re-export linters
export { lintOpenAPI } from './linters/openapi-redocly.js';
export { lintJsonSchema } from './linters/json-schema-ajv.js';

// Re-export OpenAPI differ
export { diffOpenApi, diffOpenApiObjects, resolveOpenApiSpec } from '@contractual/differs.openapi';

// Re-export everything from JSON Schema differ package
export {
  diffJsonSchema,
  diffJsonSchemaObjects,
  compareSchemas,
  checkCompatibility,
  classify,
  classifyPropertyAdded,
  classifyAll,
  CLASSIFICATION_SETS,
  resolveRefs,
  hasUnresolvedRefs,
  extractRefs,
  validateRefs,
  walk,
  formatChangeMessage,
} from '@contractual/differs.json-schema';

export type {
  CompareResult,
  CompareOptions,
  StrandsTrace,
  StrandsCompatibility,
  StrandsVersion,
  SemanticVersion,
  JsonSchemaDraft,
  ResolvedSchema,
  ResolveResult,
} from '@contractual/differs.json-schema';

// Re-export runner for custom commands
export { executeCustomCommand, parseCustomLintOutput, parseCustomDiffOutput } from './runner.js';

/**
 * Register all built-in governance engines
 *
 * Call this function at CLI startup to make all engines available
 * through the registry.
 */
export function registerAllEngines(): void {
  // Register linters
  registerLinter('openapi', lintOpenAPI);
  registerLinter('json-schema', lintJsonSchema);

  // Register differs
  registerDiffer('openapi', diffOpenApi);
  registerDiffer('json-schema', diffJsonSchema);

  // Phase 2:
  // registerLinter('asyncapi', lintAsyncAPI);
  // registerLinter('odcs', lintODCS);
  // registerDiffer('asyncapi', diffAsyncAPI);
  // registerDiffer('odcs', diffODCS);
}

// Auto-register on import
registerAllEngines();

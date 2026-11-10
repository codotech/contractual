/**
 * Re-export governance engines from @contractual/governance
 *
 * This module re-exports the governance registry functions and auto-registers
 * all built-in engines on import.
 */

// Import to trigger auto-registration of all engines
import '@contractual/governance';

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
} from '@contractual/governance';

// Re-export individual engines for direct use
export { lintOpenAPI, lintJsonSchema, diffOpenApi, diffJsonSchema } from '@contractual/governance';

// Re-export runner utilities for custom commands
export {
  executeCustomCommand,
  parseCustomLintOutput,
  parseCustomDiffOutput,
} from '@contractual/governance';

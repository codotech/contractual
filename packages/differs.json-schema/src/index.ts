/**
 * @contractual/differs.json-schema
 *
 * Detect and classify breaking changes between JSON Schema versions.
 *
 * @packageDocumentation
 */

// =============================================================================
// Strands-compatible API (primary)
// =============================================================================

export { compareSchemas, checkCompatibility } from './compare.js';

// =============================================================================
// Legacy file-based API (backward compatible)
// =============================================================================

export { diffJsonSchema, diffJsonSchemaObjects, formatChangeMessage } from './differ.js';

// =============================================================================
// Re-exports from @contractual/differs.core (backward compatibility)
// =============================================================================

export {
  // Classification
  classify,
  classifyPropertyAdded,
  classifyAll,
  CLASSIFICATION_SETS,
  // Ref resolution
  resolveRefs,
  hasUnresolvedRefs,
  extractRefs,
  validateRefs,
  type ResolveResult,
  // Walker
  walk,
  // Result assembly
  assembleResult,
  type AssembleOptions,
  // Schema types and utilities
  type ResolvedSchema,
  type JSONSchemaType,
  type NormalizedType,
  type ConstraintKey,
  type ConstraintDirection,
  type CompositionKeyword,
  type MetadataKey,
  type AnnotationKey,
  type ContentKey,
  type WalkerContext,
  isSchemaObject,
  isSchemaArray,
  normalizeType,
  arraysEqual,
  deepEqual,
  escapeJsonPointer,
  joinPath,
  CONSTRAINT_KEYS,
  CONSTRAINT_DIRECTION,
  COMPOSITION_KEYWORDS,
  METADATA_KEYS,
  ANNOTATION_KEYS,
  CONTENT_KEYS,
  DEFAULT_MAX_DEPTH,
} from '@contractual/differs.core';

// =============================================================================
// Strands API Types
// =============================================================================

export type {
  CompareResult,
  CompareOptions,
  StrandsTrace,
  StrandsCompatibility,
  StrandsVersion,
  SemanticVersion,
  JsonSchemaDraft,
} from './types.js';

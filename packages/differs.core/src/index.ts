// Core walker
export { walk } from './walker.js';

// Classification
export { classify, classifyPropertyAdded, classifyAll, CLASSIFICATION_SETS } from './classifiers.js';

// Ref resolution
export { resolveRefs, hasUnresolvedRefs, extractRefs, validateRefs, type ResolveResult } from './ref-resolver.js';

// Message formatting
export { formatChangeMessage } from './format.js';

// Result assembly
export { assembleResult, type AssembleOptions } from './assemble.js';

// Schema types and utilities
export type {
  ResolvedSchema,
  JSONSchemaType,
  NormalizedType,
  ConstraintKey,
  ConstraintDirection,
  ConstraintMeta,
  CompositionKeyword,
  MetadataKey,
  AnnotationKey,
  ContentKey,
  WalkerContext,
} from './types.js';

export {
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
} from './types.js';

// Re-export governance types from @contractual/types for convenience
export type { ChangeType, ChangeSeverity, RawChange, Change, DiffResult, DiffSummary, SuggestedBump } from '@contractual/types';
export { CHANGE_TYPE_SEVERITY } from '@contractual/types';

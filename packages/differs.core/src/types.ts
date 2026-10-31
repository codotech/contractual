/**
 * Core schema types and utilities for Contractual differs
 */

// Re-export governance types from @contractual/types
export type {
  ChangeType,
  ChangeSeverity,
  RawChange,
  Change,
  DiffResult,
  DiffSummary,
  SuggestedBump,
} from '@contractual/types';

export { CHANGE_TYPE_SEVERITY } from '@contractual/types';

// ============================================================================
// JSON Schema Types
// ============================================================================

/**
 * JSON Schema type values
 */
export type JSONSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';

/**
 * Normalized type representation (always an array for comparison)
 */
export type NormalizedType = JSONSchemaType[];

/**
 * JSON Schema constraint keys that can be tightened or loosened
 */
export type ConstraintKey =
  | 'minimum'
  | 'maximum'
  | 'exclusiveMinimum'
  | 'exclusiveMaximum'
  | 'minLength'
  | 'maxLength'
  | 'minItems'
  | 'maxItems'
  | 'minProperties'
  | 'maxProperties'
  | 'minContains'
  | 'maxContains'
  | 'pattern'
  | 'multipleOf'
  | 'uniqueItems';

/**
 * Constraint comparison direction
 */
export type ConstraintDirection = 'min' | 'max' | 'exact';

/**
 * Constraint metadata for determining tightened vs loosened
 */
export interface ConstraintMeta {
  readonly key: ConstraintKey;
  readonly direction: ConstraintDirection;
}

/**
 * Map of constraint keys to their comparison direction
 */
export const CONSTRAINT_DIRECTION: Record<ConstraintKey, ConstraintDirection> = {
  minimum: 'min',
  maximum: 'max',
  exclusiveMinimum: 'min',
  exclusiveMaximum: 'max',
  minLength: 'min',
  maxLength: 'max',
  minItems: 'min',
  maxItems: 'max',
  minProperties: 'min',
  maxProperties: 'max',
  minContains: 'min',
  maxContains: 'max',
  pattern: 'exact',
  multipleOf: 'exact',
  uniqueItems: 'exact',
};

/**
 * All constraint keys for iteration
 */
export const CONSTRAINT_KEYS: ConstraintKey[] = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
  'minContains',
  'maxContains',
  'pattern',
  'multipleOf',
  'uniqueItems',
];

/**
 * Composition keywords in JSON Schema
 */
export type CompositionKeyword = 'anyOf' | 'oneOf' | 'allOf' | 'if' | 'then' | 'else' | 'not';

/**
 * All composition keywords for iteration
 */
export const COMPOSITION_KEYWORDS: CompositionKeyword[] = [
  'anyOf',
  'oneOf',
  'allOf',
  'if',
  'then',
  'else',
  'not',
];

/**
 * Metadata keys that are compared (patch-level changes)
 */
export type MetadataKey = 'description' | 'title' | 'default' | 'examples';

/**
 * All metadata keys for iteration
 */
export const METADATA_KEYS: MetadataKey[] = ['description', 'title', 'default', 'examples'];

/**
 * Annotation keys (patch-level changes per Strands API)
 */
export type AnnotationKey = 'deprecated' | 'readOnly' | 'writeOnly';

/**
 * All annotation keys for iteration
 */
export const ANNOTATION_KEYS: AnnotationKey[] = ['deprecated', 'readOnly', 'writeOnly'];

/**
 * Content keywords (patch-level changes per Strands API)
 */
export type ContentKey = 'contentEncoding' | 'contentMediaType' | 'contentSchema';

/**
 * All content keys for iteration
 */
export const CONTENT_KEYS: ContentKey[] = ['contentEncoding', 'contentMediaType', 'contentSchema'];

/**
 * Resolved JSON Schema object (refs already resolved)
 */
export interface ResolvedSchema {
  // Schema identification
  $schema?: string;
  $id?: string;
  $ref?: string;
  $defs?: Record<string, ResolvedSchema>;

  // Type
  type?: JSONSchemaType | JSONSchemaType[];

  // Metadata
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];

  // Annotations (Draft 2019-09+)
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;

  // Enum
  enum?: unknown[];
  const?: unknown;

  // Format
  format?: string;

  // Numeric constraints
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // String constraints
  minLength?: number;
  maxLength?: number;
  pattern?: string;

  // Content keywords (Draft 7+)
  contentEncoding?: string;
  contentMediaType?: string;
  contentSchema?: ResolvedSchema;

  // Object keywords
  properties?: Record<string, ResolvedSchema>;
  required?: string[];
  additionalProperties?: boolean | ResolvedSchema;
  minProperties?: number;
  maxProperties?: number;
  propertyNames?: ResolvedSchema;
  patternProperties?: Record<string, ResolvedSchema>;
  dependentRequired?: Record<string, string[]>;
  dependentSchemas?: Record<string, ResolvedSchema>;
  unevaluatedProperties?: boolean | ResolvedSchema;

  // Array keywords
  items?: ResolvedSchema | ResolvedSchema[];
  prefixItems?: ResolvedSchema[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  contains?: ResolvedSchema;
  minContains?: number;
  maxContains?: number;
  unevaluatedItems?: boolean | ResolvedSchema;

  // Composition
  anyOf?: ResolvedSchema[];
  oneOf?: ResolvedSchema[];
  allOf?: ResolvedSchema[];
  if?: ResolvedSchema;
  then?: ResolvedSchema;
  else?: ResolvedSchema;
  not?: ResolvedSchema;

  // Allow additional properties for extensibility
  [key: string]: unknown;
}

/**
 * Walker context for tracking traversal state
 */
export interface WalkerContext {
  /** Current JSON Pointer path */
  readonly path: string;
  /** Depth of recursion (for cycle detection) */
  readonly depth: number;
  /** Maximum allowed depth */
  readonly maxDepth: number;
}

/**
 * Default maximum recursion depth
 */
export const DEFAULT_MAX_DEPTH = 100;

/**
 * Type guard to check if value is a schema object
 */
export function isSchemaObject(value: unknown): value is ResolvedSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if value is an array of schemas
 */
export function isSchemaArray(value: unknown): value is ResolvedSchema[] {
  return Array.isArray(value) && value.every(isSchemaObject);
}

/**
 * Normalize type to array for consistent comparison
 */
export function normalizeType(type: JSONSchemaType | JSONSchemaType[] | undefined): NormalizedType {
  if (type === undefined) {
    return [];
  }
  if (Array.isArray(type)) {
    return [...type].sort();
  }
  return [type];
}

/**
 * Check if two arrays have the same elements (order-independent)
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Deep equality check for JSON values
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (a === null || b === null) return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

/**
 * Escape JSON Pointer segment according to RFC 6901
 */
export function escapeJsonPointer(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Join path segments into a JSON Pointer
 */
export function joinPath(basePath: string, ...segments: string[]): string {
  const escaped = segments.map(escapeJsonPointer);
  if (basePath === '') {
    return escaped.length > 0 ? '/' + escaped.join('/') : '';
  }
  return basePath + '/' + escaped.join('/');
}

/**
 * JSON Schema Change Classifiers
 *
 * Classifies raw structural changes into severity levels for semantic versioning.
 * Follows API compatibility principles where breaking changes require major bumps,
 * additive changes require minor bumps, and metadata changes are patches.
 */

import type { RawChange, ChangeType, ChangeSeverity } from '@contractual/types';

/**
 * Change types that are always breaking (require major version bump)
 *
 * These changes can break existing consumers:
 * - Removing properties removes data they may depend on
 * - Adding required fields forces consumers to provide new data
 * - Type changes can break parsing/validation
 * - Enum removals can invalidate existing data
 * - Tightened constraints can reject previously valid data
 * - Composition option additions can change validation semantics
 *
 * Aligned with Strands API classification rules.
 */
const BREAKING_CHANGES: ReadonlySet<ChangeType> = new Set<ChangeType>([
  'property-removed',
  'required-added',
  'type-changed',
  'type-narrowed',
  'enum-value-removed',
  'enum-added',
  'constraint-tightened',
  'additional-properties-denied',
  'items-changed',
  'min-items-increased',
  'max-items-decreased',
  'ref-target-changed',
  'dependent-required-added',
  // Composition breaking changes (per Strands API)
  'anyof-option-added',
  'oneof-option-added',
  'allof-member-added',
  'not-schema-changed',
  // OpenAPI structural breaking changes
  'path-removed',
  'operation-removed',
  'parameter-required-added',
  'parameter-removed',
  'parameter-required-changed',
  'request-body-added',
  'response-removed',
  'security-changed',
]);

/**
 * Change types that are non-breaking (require minor version bump)
 *
 * These changes are backward compatible additions/relaxations:
 * - Adding optional properties extends the schema without breaking
 * - Removing required constraints makes the schema more permissive
 * - Type widening accepts more values
 * - Loosened constraints accept more values
 * - Composition option removals make schema less restrictive
 *
 * Aligned with Strands API classification rules.
 */
const NON_BREAKING_CHANGES: ReadonlySet<ChangeType> = new Set<ChangeType>([
  'property-added',
  'required-removed',
  'type-widened',
  'enum-value-added',
  'enum-removed',
  'constraint-loosened',
  'additional-properties-allowed',
  'additional-properties-changed',
  'dependent-required-removed',
  // Composition non-breaking changes (per Strands API)
  'anyof-option-removed',
  'oneof-option-removed',
  'allof-member-removed',
  // OpenAPI structural non-breaking changes
  'parameter-added',
  'path-added',
  'operation-added',
  'request-body-removed',
  'response-added',
  'server-changed',
]);

/**
 * Change types that are patches (documentation/metadata only)
 *
 * These changes don't affect validation behavior:
 * - Description changes are documentation only
 * - Title changes are display metadata
 * - Default/example changes don't affect validation
 * - Format is an annotation (per Strands API) - doesn't affect validation
 * - Annotation keywords (deprecated, readOnly, writeOnly)
 * - Content keywords (contentEncoding, contentMediaType, contentSchema)
 *
 * Aligned with Strands API classification rules.
 */
const PATCH_CHANGES: ReadonlySet<ChangeType> = new Set<ChangeType>([
  // Metadata changes
  'description-changed',
  'title-changed',
  'default-changed',
  'examples-changed',
  // Format is annotation (patch per Strands API)
  'format-added',
  'format-removed',
  'format-changed',
  // Annotation keywords (Draft 2019-09+)
  'deprecated-changed',
  'read-only-changed',
  'write-only-changed',
  // Content keywords
  'content-encoding-changed',
  'content-media-type-changed',
  'content-schema-changed',
]);

/**
 * Change types that require manual review
 *
 * These changes are too complex to classify automatically:
 * - Generic composition changes require semantic analysis
 * - Complex keywords (propertyNames, dependentSchemas, unevaluated*)
 * - Conditional schema changes (if/then/else)
 * - Unknown changes need human evaluation
 *
 * Aligned with Strands API classification rules.
 */
const UNKNOWN_CHANGES: ReadonlySet<ChangeType> = new Set<ChangeType>([
  // Complex object keywords
  'property-names-changed',
  'dependent-schemas-changed',
  'unevaluated-properties-changed',
  // Complex array keywords
  'unevaluated-items-changed',
  'min-contains-changed',
  'max-contains-changed',
  // Conditional schema
  'if-then-else-changed',
  // Legacy/generic composition
  'composition-changed',
  // OpenAPI context-dependent (schema-level changes handled by walker)
  'parameter-schema-changed',
  'response-schema-changed',
  // Catch-all
  'unknown-change',
]);

/**
 * Export classification sets for external analysis
 */
export const CLASSIFICATION_SETS = {
  breaking: BREAKING_CHANGES,
  nonBreaking: NON_BREAKING_CHANGES,
  patch: PATCH_CHANGES,
  unknown: UNKNOWN_CHANGES,
} as const;

/**
 * Classify a raw change into a severity level
 *
 * Uses the Strands API classification rules where:
 * - Breaking changes require major version bump
 * - Non-breaking changes require minor version bump
 * - Patch changes are metadata/annotation only
 * - Unknown changes require manual review
 *
 * @param change - The raw change to classify
 * @returns The severity classification
 *
 * @example
 * ```typescript
 * const change: RawChange = {
 *   path: '/properties/name',
 *   type: 'property-removed',
 *   oldValue: { type: 'string' },
 * };
 * const severity = classify(change);
 * // severity === 'breaking'
 * ```
 */
export function classify(change: RawChange): ChangeSeverity {
  const { type } = change;

  // Check each category in order of specificity
  if (BREAKING_CHANGES.has(type)) {
    return 'breaking';
  }

  if (NON_BREAKING_CHANGES.has(type)) {
    return 'non-breaking';
  }

  if (PATCH_CHANGES.has(type)) {
    return 'patch';
  }

  if (UNKNOWN_CHANGES.has(type)) {
    return 'unknown';
  }

  // Defensive: any unhandled type is unknown
  return 'unknown';
}

/**
 * Classify a property-added change with schema context
 *
 * Property additions are breaking if the property is required,
 * otherwise they are non-breaking (additive).
 *
 * @param change - The property-added change
 * @param newSchema - The new schema for context (to check required array)
 * @returns The severity classification
 *
 * @example
 * ```typescript
 * const change: RawChange = {
 *   path: '/properties/email',
 *   type: 'property-added',
 *   newValue: { type: 'string', format: 'email' },
 * };
 *
 * const schema = {
 *   type: 'object',
 *   properties: { email: { type: 'string', format: 'email' } },
 *   required: ['email'], // email is required!
 * };
 *
 * const severity = classifyPropertyAdded(change, schema);
 * // severity === 'breaking' (because email is in required[])
 * ```
 */
export function classifyPropertyAdded(change: RawChange, newSchema: unknown): ChangeSeverity {
  // Validate change type
  if (change.type !== 'property-added') {
    return classify(change);
  }

  // Extract property name from path
  const propertyName = extractPropertyName(change.path);
  if (!propertyName) {
    // Cannot determine property name, fall back to non-breaking
    return 'non-breaking';
  }

  // Find the parent schema containing this property
  const parentSchema = findParentSchema(change.path, newSchema);
  if (!parentSchema) {
    // Cannot find parent schema, fall back to non-breaking
    return 'non-breaking';
  }

  // Check if property is in the required array
  const required = getRequiredArray(parentSchema);
  if (required.includes(propertyName)) {
    // Adding a required property is breaking
    return 'breaking';
  }

  // Adding an optional property is non-breaking
  return 'non-breaking';
}

/**
 * Extract the property name from a JSON Pointer path
 *
 * @param path - JSON Pointer path (e.g., '/properties/name' or '/properties/user/properties/email')
 * @returns The property name or null if not found
 */
function extractPropertyName(path: string): string | null {
  // Match the last /properties/NAME segment
  const match = path.match(/\/properties\/([^/]+)$/);
  if (match?.[1] !== undefined) {
    return decodeJsonPointerSegment(match[1]);
  }

  return null;
}

/**
 * Decode a JSON Pointer segment (handles ~0 and ~1 escapes)
 *
 * @param segment - The encoded segment
 * @returns The decoded segment
 */
function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Find the parent schema containing a property
 *
 * @param path - JSON Pointer path to the property
 * @param schema - The root schema
 * @returns The parent schema or null if not found
 */
function findParentSchema(path: string, schema: unknown): unknown {
  if (!isObject(schema)) {
    return null;
  }

  // Remove the last segment to get parent path
  // e.g., '/properties/name' -> '' (root)
  // e.g., '/properties/user/properties/email' -> '/properties/user'
  const segments = path.split('/').filter(Boolean);

  // We need to navigate to the schema containing /properties/NAME
  // So we remove 'properties' and 'NAME' from the end
  if (segments.length < 2) {
    // Path is too short, parent is root
    return schema;
  }

  // Remove 'NAME' and 'properties' from the end
  const parentSegments = segments.slice(0, -2);

  // Navigate to parent
  let current: unknown = schema;
  for (const segment of parentSegments) {
    if (!isObject(current)) {
      return null;
    }
    const decoded = decodeJsonPointerSegment(segment);
    current = (current as Record<string, unknown>)[decoded];
  }

  return current;
}

/**
 * Get the required array from a schema object
 *
 * @param schema - The schema object
 * @returns Array of required property names
 */
function getRequiredArray(schema: unknown): string[] {
  if (!isObject(schema)) {
    return [];
  }

  const obj = schema as Record<string, unknown>;
  const required = obj['required'];

  if (!Array.isArray(required)) {
    return [];
  }

  return required.filter((item): item is string => typeof item === 'string');
}

/**
 * Type guard for objects
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Batch classify multiple changes
 *
 * @param changes - Array of raw changes
 * @param newSchema - Optional schema for context-aware classification
 * @returns Map of change to severity
 */
export function classifyAll(
  changes: readonly RawChange[],
  newSchema?: unknown
): Map<RawChange, ChangeSeverity> {
  const results = new Map<RawChange, ChangeSeverity>();

  for (const change of changes) {
    if (change.type === 'property-added' && newSchema !== undefined) {
      results.set(change, classifyPropertyAdded(change, newSchema));
    } else {
      results.set(change, classify(change));
    }
  }

  return results;
}

/**
 * Get a human-readable message for a classified change
 *
 * @param change - The raw change
 * @param severity - The classified severity
 * @returns Human-readable description
 */
export function getChangeMessage(change: RawChange, severity: ChangeSeverity): string {
  const severityLabel =
    severity === 'breaking'
      ? 'BREAKING'
      : severity === 'non-breaking'
        ? 'Non-breaking'
        : severity === 'patch'
          ? 'Patch'
          : 'Unknown';

  const typeLabel = formatChangeType(change.type);

  return `[${severityLabel}] ${typeLabel} at ${change.path}`;
}

/**
 * Format a change type into a human-readable label
 */
function formatChangeType(type: ChangeType): string {
  return type
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Severity classification for detected changes between spec versions.
 *
 * @remarks
 * - `breaking` - Changes that will break existing consumers (major bump)
 * - `non-breaking` - Additive changes that are backwards compatible (minor bump)
 * - `patch` - Metadata-only changes (patch bump)
 * - `unknown` - Complex changes requiring manual review
 */
export type ChangeSeverity = 'breaking' | 'non-breaking' | 'patch' | 'unknown';

/**
 * A single change detected between two spec versions.
 *
 * @example
 * ```typescript
 * const change: Change = {
 *   path: '/properties/amount/type',
 *   severity: 'breaking',
 *   category: 'type-changed',
 *   message: "Changed type of field 'amount': string -> number",
 *   oldValue: 'string',
 *   newValue: 'number'
 * };
 * ```
 */
export interface Change {
  /** JSON Pointer path to the changed element (e.g., "/properties/amount/type") */
  path: string;
  /** Severity classification determining version bump */
  severity: ChangeSeverity;
  /** Category key for grouping similar changes (e.g., "field-removed", "type-changed") */
  category: string;
  /** Human-readable description of the change */
  message: string;
  /** Value in the old spec (undefined if added) */
  oldValue?: unknown;
  /** Value in the new spec (undefined if removed) */
  newValue?: unknown;
}

/**
 * Summary counts of changes by severity.
 */
export interface DiffSummary {
  /** Number of breaking changes detected */
  breaking: number;
  /** Number of non-breaking (additive) changes detected */
  nonBreaking: number;
  /** Number of patch-level (metadata) changes detected */
  patch: number;
  /** Number of unclassifiable changes requiring manual review */
  unknown: number;
}

/**
 * Suggested semver bump based on detected changes.
 *
 * @remarks
 * - `major` - Breaking changes detected
 * - `minor` - Non-breaking structural changes
 * - `patch` - Metadata-only changes
 * - `none` - No changes detected
 */
export type SuggestedBump = 'major' | 'minor' | 'patch' | 'none';

/**
 * Result of comparing two spec versions.
 */
export interface DiffResult {
  /** Contract name from config */
  contract: string;
  /** List of all detected changes */
  changes: Change[];
  /** Aggregated summary counts by severity */
  summary: DiffSummary;
  /** Recommended semver bump based on highest severity change */
  suggestedBump: SuggestedBump;
}

/**
 * Severity of a lint diagnostic.
 */
export type LintSeverity = 'error' | 'warning';

/**
 * A single lint issue found in a spec.
 */
export interface LintIssue {
  /** Location in spec (JSON Pointer path or line:col) */
  path: string;
  /** Human-readable issue description */
  message: string;
  /** Rule identifier if available (e.g., "operation-operationId") */
  rule?: string;
  /** Issue severity */
  severity: LintSeverity;
}

/**
 * Result of linting a spec file.
 */
export interface LintResult {
  /** Contract name from config */
  contract: string;
  /** Absolute path to the spec file that was linted */
  specPath: string;
  /** List of error-level issues (cause lint failure) */
  errors: LintIssue[];
  /** List of warning-level issues (informational) */
  warnings: LintIssue[];
}

/**
 * Options for linter functions.
 */
export interface LintOptions {
  /** Custom ruleset configuration */
  ruleset?: string;
  /** Additional tool-specific options */
  [key: string]: unknown;
}

/**
 * Function signature for linter implementations.
 *
 * @param specPath - Absolute path to the spec file to lint
 * @param options - Optional linter configuration
 * @returns Promise resolving to lint results
 */
export type LintFn = (specPath: string, options?: LintOptions) => Promise<LintResult>;

/**
 * Options for differ functions.
 */
export interface DiffOptions {
  /** Include metadata-only (patch) changes in results */
  includeMetadata?: boolean;
  /** Additional tool-specific options */
  [key: string]: unknown;
}

/**
 * Function signature for differ implementations.
 *
 * @param oldSpecPath - Absolute path to the old (baseline) spec
 * @param newSpecPath - Absolute path to the new (current) spec
 * @param options - Optional differ configuration
 * @returns Promise resolving to diff results
 */
export type DiffFn = (
  oldSpecPath: string,
  newSpecPath: string,
  options?: DiffOptions
) => Promise<DiffResult>;

/**
 * All possible structural change types for classification.
 *
 * @remarks
 * These categories are used internally by differs to classify raw changes
 * before mapping to severity levels.
 */
export type ChangeType =
  // Property-level changes
  | 'property-added'
  | 'property-removed'
  | 'required-added'
  | 'required-removed'
  // Type-level changes
  | 'type-changed'
  | 'type-narrowed'
  | 'type-widened'
  // Enum-level changes
  | 'enum-value-added'
  | 'enum-value-removed'
  | 'enum-added'
  | 'enum-removed'
  // Constraint-level changes
  | 'constraint-tightened'
  | 'constraint-loosened'
  | 'format-changed'
  | 'format-added'
  | 'format-removed'
  // Object-level changes
  | 'additional-properties-denied'
  | 'additional-properties-allowed'
  | 'additional-properties-changed'
  | 'property-names-changed'
  | 'dependent-required-added'
  | 'dependent-required-removed'
  | 'dependent-schemas-changed'
  | 'unevaluated-properties-changed'
  // Array-level changes
  | 'items-changed'
  | 'min-items-increased'
  | 'max-items-decreased'
  | 'min-contains-changed'
  | 'max-contains-changed'
  | 'unevaluated-items-changed'
  // Ref-level changes
  | 'ref-target-changed'
  // Metadata-level changes (patch)
  | 'description-changed'
  | 'title-changed'
  | 'default-changed'
  | 'examples-changed'
  // Annotation changes (patch per Strands API)
  | 'deprecated-changed'
  | 'read-only-changed'
  | 'write-only-changed'
  // Content keyword changes (patch per Strands API)
  | 'content-encoding-changed'
  | 'content-media-type-changed'
  | 'content-schema-changed'
  // Granular composition changes (replacing generic composition-changed)
  | 'anyof-option-added'
  | 'anyof-option-removed'
  | 'oneof-option-added'
  | 'oneof-option-removed'
  | 'allof-member-added'
  | 'allof-member-removed'
  | 'not-schema-changed'
  | 'if-then-else-changed'
  // Legacy composition (for backward compat)
  | 'composition-changed'
  // OpenAPI structural changes
  | 'path-added'
  | 'path-removed'
  | 'operation-added'
  | 'operation-removed'
  | 'parameter-added'
  | 'parameter-required-added'
  | 'parameter-removed'
  | 'parameter-required-changed'
  | 'parameter-schema-changed'
  | 'request-body-added'
  | 'request-body-removed'
  | 'response-added'
  | 'response-removed'
  | 'response-schema-changed'
  | 'security-changed'
  | 'server-changed'
  // Catch-all for unrecognized changes
  | 'unknown-change';

/**
 * Raw change detected by a differ before severity classification.
 *
 * @remarks
 * This is an internal type used by differ implementations.
 * Raw changes are classified into {@link Change} with severity.
 */
export interface RawChange {
  /** JSON Pointer path to the change location */
  path: string;
  /** Structural change type for classification */
  type: ChangeType;
  /** Value in old spec (undefined if added) */
  oldValue?: unknown;
  /** Value in new spec (undefined if removed) */
  newValue?: unknown;
}

/**
 * Mapping from change types to their severity classification.
 *
 * @remarks
 * This constant provides the default classification rules aligned with Strands API.
 * Breaking changes cause major bumps, non-breaking cause minor, etc.
 */
export const CHANGE_TYPE_SEVERITY: Record<ChangeType, ChangeSeverity> = {
  // Breaking changes (major)
  'property-removed': 'breaking',
  'required-added': 'breaking',
  'type-changed': 'breaking',
  'type-narrowed': 'breaking',
  'enum-value-removed': 'breaking',
  'enum-added': 'breaking',
  'constraint-tightened': 'breaking',
  'additional-properties-denied': 'breaking',
  'items-changed': 'breaking',
  'min-items-increased': 'breaking',
  'max-items-decreased': 'breaking',
  'ref-target-changed': 'breaking',
  'dependent-required-added': 'breaking',
  // Composition breaking changes (per Strands API)
  'anyof-option-added': 'breaking',
  'oneof-option-added': 'breaking',
  'allof-member-added': 'breaking',
  'not-schema-changed': 'breaking',

  // Non-breaking changes (minor)
  'property-added': 'non-breaking',
  'required-removed': 'non-breaking',
  'type-widened': 'non-breaking',
  'enum-value-added': 'non-breaking',
  'enum-removed': 'non-breaking',
  'constraint-loosened': 'non-breaking',
  'additional-properties-allowed': 'non-breaking',
  'additional-properties-changed': 'non-breaking',
  'dependent-required-removed': 'non-breaking',
  // Composition non-breaking changes (per Strands API)
  'anyof-option-removed': 'non-breaking',
  'oneof-option-removed': 'non-breaking',
  'allof-member-removed': 'non-breaking',

  // Patch-level changes (per Strands API - format is annotation)
  'format-added': 'patch',
  'format-removed': 'patch',
  'format-changed': 'patch',
  'description-changed': 'patch',
  'title-changed': 'patch',
  'default-changed': 'patch',
  'examples-changed': 'patch',
  // Annotation changes (patch per Strands API)
  'deprecated-changed': 'patch',
  'read-only-changed': 'patch',
  'write-only-changed': 'patch',
  // Content keyword changes (patch per Strands API)
  'content-encoding-changed': 'patch',
  'content-media-type-changed': 'patch',
  'content-schema-changed': 'patch',

  // Requires manual review (unknown)
  'property-names-changed': 'unknown',
  'dependent-schemas-changed': 'unknown',
  'unevaluated-properties-changed': 'unknown',
  'unevaluated-items-changed': 'unknown',
  'min-contains-changed': 'unknown',
  'max-contains-changed': 'unknown',
  'if-then-else-changed': 'unknown',
  'composition-changed': 'unknown',
  // OpenAPI structural changes
  'path-removed': 'breaking',
  'operation-removed': 'breaking',
  'parameter-added': 'non-breaking',
  'parameter-required-added': 'breaking',
  'parameter-removed': 'breaking',
  'parameter-required-changed': 'breaking',
  'request-body-added': 'breaking',
  'response-removed': 'breaking',
  'security-changed': 'breaking',
  'path-added': 'non-breaking',
  'operation-added': 'non-breaking',
  'request-body-removed': 'non-breaking',
  'response-added': 'non-breaking',
  'server-changed': 'non-breaking',
  'parameter-schema-changed': 'unknown',
  'response-schema-changed': 'unknown',
  'unknown-change': 'unknown',
};

/**
 * Type guard to check if a value is a valid ChangeSeverity.
 *
 * @param value - The value to check
 * @returns True if the value is a valid ChangeSeverity
 */
export function isChangeSeverity(value: unknown): value is ChangeSeverity {
  return (
    typeof value === 'string' && ['breaking', 'non-breaking', 'patch', 'unknown'].includes(value)
  );
}

/**
 * Type guard to check if a value is a valid ChangeType.
 *
 * @param value - The value to check
 * @returns True if the value is a valid ChangeType
 */
export function isChangeType(value: unknown): value is ChangeType {
  return typeof value === 'string' && value in CHANGE_TYPE_SEVERITY;
}

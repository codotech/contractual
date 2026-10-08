/**
 * Strands API types for JSON Schema comparison
 *
 * These types are specific to the Strands-compatible comparison API.
 * Core schema diffing types are in @contractual/differs.core.
 */

/**
 * Strands compatibility classification for a trace
 */
export type StrandsCompatibility = 'incompatible' | 'compatible' | 'unknown';

/**
 * Strands version bump level
 */
export type StrandsVersion = 'equal' | 'patch' | 'minor' | 'major' | null;

/**
 * A single trace showing where schemas differ (Strands format)
 */
export interface StrandsTrace {
  /** Compatibility status of this change */
  readonly compatibility: StrandsCompatibility;
  /** JSON Pointer path in the source (left) schema, null if added */
  readonly left: string | null;
  /** JSON Pointer path in the target (right) schema, null if removed */
  readonly right: string | null;
}

/**
 * Semantic version object
 */
export interface SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly version: string;
}

/**
 * Strands API response format
 */
export interface CompareResult {
  /** Version bump level, null if unknown/error */
  readonly version: StrandsVersion;
  /** List of traces showing where schemas differ */
  readonly traces: StrandsTrace[];
  /** Computed new version based on current version + bump */
  readonly newVersion: SemanticVersion | null;
  /** Error or warning message */
  readonly message?: string;
}

/**
 * Options for schema comparison
 */
export interface CompareOptions {
  /** Current version to compute newVersion from (e.g., "1.0.0") */
  readonly currentVersion?: string;
  /** Draft version for validation rules */
  readonly draft?: JsonSchemaDraft;
}

/**
 * Supported JSON Schema drafts
 */
export type JsonSchemaDraft = 'draft-07' | 'draft-2019-09' | 'draft-2020-12';

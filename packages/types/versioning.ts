import type { DiffResult, LintResult } from './governance.js';

/**
 * Semver bump type for version increments.
 */
export type BumpType = 'major' | 'minor' | 'patch';

/**
 * Version entry for a single contract in the history.
 */
export interface VersionEntry {
  /** Semver version string (e.g., "1.2.0") */
  version: string;
  /** ISO 8601 timestamp of when this version was released */
  released: string;
  /** Changeset filenames that contributed to this version */
  changesets?: string[];
}

/**
 * Contents of versions.json file for a single contract.
 *
 * @example
 * ```json
 * {
 *   "current": "1.2.0",
 *   "versions": [
 *     { "version": "0.1.0", "released": "2026-02-01T10:00:00Z" },
 *     { "version": "1.0.0", "released": "2026-02-05T14:30:00Z", "changesets": ["brave-tigers-fly"] }
 *   ]
 * }
 * ```
 */
export interface ContractVersionsFile {
  /** Current (latest) version */
  current: string;
  /** History of all versions */
  versions: VersionEntry[];
}

/**
 * Simple version entry used in the legacy VersionsFile format.
 * Contains only the essential version tracking fields.
 */
export interface SimpleVersionEntry {
  /** Current version */
  version: string;
  /** ISO 8601 timestamp of last release */
  released: string;
}

/**
 * Aggregated versions.json file mapping contract names to their version info.
 *
 * @remarks
 * This is the legacy format used for simple version tracking.
 * For richer history tracking, use ContractVersionsFile per contract.
 */
export interface VersionsFile {
  [contractName: string]: SimpleVersionEntry;
}

/**
 * Parsed changeset file data.
 *
 * @example
 * ```markdown
 * ---
 * "orders-api": major
 * "order-schema": minor
 * ---
 *
 * ## orders-api
 *
 * **Breaking changes:**
 * - Removed endpoint GET /orders/{id}/details
 * ```
 */
export interface ChangesetFile {
  /** Filename without path (e.g., "brave-tigers-fly.md") */
  filename: string;
  /** Full path to the changeset file */
  path: string;
  /** Map of contract name to bump type */
  bumps: Record<string, BumpType>;
  /** Markdown body with change descriptions */
  body: string;
}

/**
 * Result of applying a version bump to a single contract.
 */
export interface BumpResult {
  /** Contract name */
  contract: string;
  /** Version before bump */
  oldVersion: string;
  /** Version after bump */
  newVersion: string;
  /** Type of bump applied */
  bumpType: BumpType;
  /** Markdown section describing changes from changeset body */
  changes: string;
}

/**
 * Result of the `contractual version` command.
 */
export interface VersionCommandResult {
  /** All version bumps that were applied */
  bumps: BumpResult[];
  /** Filenames of changesets that were consumed */
  consumedChangesets: string[];
  /** Updated changelog content (if generated) */
  changelog?: string;
}

/**
 * Result of the `contractual lint` command.
 */
export interface LintCommandResult {
  /** Whether all contracts passed linting (no errors) */
  success: boolean;
  /** Individual lint results per contract */
  results: LintResult[];
  /** Total error count across all contracts */
  errorCount: number;
  /** Total warning count across all contracts */
  warningCount: number;
}

/**
 * Result of the `contractual breaking` command.
 */
export interface BreakingCommandResult {
  /** Whether any breaking changes were detected */
  hasBreaking: boolean;
  /** Individual diff results per contract */
  results: DiffResult[];
  /** Suggested overall bump type based on highest severity */
  suggestedBump: BumpType | 'none';
}

/**
 * Result of the `contractual changeset` command.
 */
export interface ChangesetCommandResult {
  /** Whether a changeset was created */
  created: boolean;
  /** Path to the created changeset file (if created) */
  path?: string;
  /** Filename of the created changeset (if created) */
  filename?: string;
  /** Map of contract names to their detected bump types */
  bumps: Record<string, BumpType>;
}

/**
 * Result of the `contractual status` command.
 */
export interface StatusCommandResult {
  /** Current contract versions */
  versions: Record<string, string>;
  /** Pending changesets awaiting consumption */
  pendingChangesets: string[];
  /** Predicted version bumps from pending changesets */
  pendingBumps: Record<string, { current: string; next: string; bumpType: BumpType }>;
  /** Whether there are uncommitted spec changes without changesets */
  hasUncommittedChanges: boolean;
}

/**
 * Type guard to check if a value is a valid BumpType.
 *
 * @param value - The value to check
 * @returns True if the value is a valid BumpType
 */
export function isBumpType(value: unknown): value is BumpType {
  return (
    typeof value === 'string' &&
    ['major', 'minor', 'patch'].includes(value)
  );
}

/**
 * Pre-release state stored in .contractual/pre.json
 *
 * @example
 * ```json
 * {
 *   "tag": "beta",
 *   "enteredAt": "2026-03-10T10:00:00Z",
 *   "initialVersions": {
 *     "orders-api": "1.2.0"
 *   }
 * }
 * ```
 */
export interface PreReleaseState {
  /** Pre-release tag (e.g., "alpha", "beta", "rc") */
  tag: string;
  /** ISO 8601 timestamp when pre-release mode was entered */
  enteredAt: string;
  /** Versions of contracts when pre-release mode was entered */
  initialVersions: Record<string, string>;
}

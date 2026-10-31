/**
 * Strands-compatible JSON Schema comparison API
 *
 * Provides schema comparison with output format matching the Strands API
 * (https://strands.octue.com/api/compare-schemas)
 */

import type { ChangeSeverity, RawChange } from '@contractual/types';
import type {
  CompareResult,
  CompareOptions,
  StrandsTrace,
  StrandsCompatibility,
  StrandsVersion,
  SemanticVersion,
} from './types.js';
import { resolveRefs, walk, classify, classifyPropertyAdded } from '@contractual/differs.core';

/**
 * Compare two JSON Schema objects and return Strands-compatible result
 *
 * @param sourceSchema - The source (old/baseline) schema object
 * @param targetSchema - The target (new/current) schema object
 * @param options - Optional comparison options
 * @returns CompareResult in Strands API format
 *
 * @example
 * ```typescript
 * const source = { type: 'object', properties: { name: { type: 'string' } } };
 * const target = { type: 'object', properties: { name: { type: 'number' } } };
 *
 * const result = compareSchemas(source, target, { currentVersion: '1.0.0' });
 * console.log(result.version);    // 'major'
 * console.log(result.newVersion); // { major: 2, minor: 0, patch: 0, version: '2.0.0' }
 * ```
 */
export function compareSchemas(
  sourceSchema: unknown,
  targetSchema: unknown,
  options?: CompareOptions
): CompareResult {
  // Resolve $refs in both schemas
  const resolvedSourceResult = resolveRefs(sourceSchema);
  const resolvedTargetResult = resolveRefs(targetSchema);

  const resolvedSource = resolvedSourceResult.schema;
  const resolvedTarget = resolvedTargetResult.schema;

  // Walk both schemas and detect raw changes
  const rawChanges = walk(resolvedSource, resolvedTarget, '');

  // Classify changes and generate traces
  const traces: StrandsTrace[] = [];
  let hasBreaking = false;
  let hasNonBreaking = false;
  let hasPatch = false;
  let hasUnknown = false;

  for (const raw of rawChanges) {
    const severity = classifyChange(raw, resolvedTarget);

    // Track highest severity
    switch (severity) {
      case 'breaking':
        hasBreaking = true;
        break;
      case 'non-breaking':
        hasNonBreaking = true;
        break;
      case 'patch':
        hasPatch = true;
        break;
      case 'unknown':
        hasUnknown = true;
        break;
    }

    // Generate trace
    const trace = rawChangeToTrace(raw, severity);
    traces.push(trace);
  }

  // Determine version bump
  const version = determineVersion(hasBreaking, hasNonBreaking, hasPatch, hasUnknown, traces);

  // Compute new version if current version provided
  const newVersion = options?.currentVersion
    ? computeNewVersion(options.currentVersion, version)
    : null;

  return {
    version,
    traces,
    newVersion,
  };
}

/**
 * Classify a change, with context-aware classification for property-added
 */
function classifyChange(change: RawChange, newSchema: unknown): ChangeSeverity {
  if (change.type === 'property-added') {
    return classifyPropertyAdded(change, newSchema);
  }
  return classify(change);
}

/**
 * Convert a RawChange to a Strands trace
 */
function rawChangeToTrace(change: RawChange, severity: ChangeSeverity): StrandsTrace {
  const compatibility = severityToCompatibility(severity);

  // Determine left/right paths based on change type
  const isAddition =
    change.type.includes('added') ||
    change.type === 'type-widened' ||
    change.type === 'constraint-loosened';
  const isRemoval =
    change.type.includes('removed') ||
    change.type === 'type-narrowed' ||
    change.type === 'constraint-tightened';

  let left: string | null = change.path;
  let right: string | null = change.path;

  // For additions, left is null (didn't exist in source)
  if (isAddition && change.oldValue === undefined) {
    left = null;
  }

  // For removals, right is null (doesn't exist in target)
  if (isRemoval && change.newValue === undefined) {
    right = null;
  }

  return {
    compatibility,
    left,
    right,
  };
}

/**
 * Map ChangeSeverity to Strands compatibility
 */
function severityToCompatibility(severity: ChangeSeverity): StrandsCompatibility {
  switch (severity) {
    case 'breaking':
      return 'incompatible';
    case 'non-breaking':
    case 'patch':
      return 'compatible';
    case 'unknown':
    default:
      return 'unknown';
  }
}

/**
 * Determine the version bump level based on detected changes
 */
function determineVersion(
  hasBreaking: boolean,
  hasNonBreaking: boolean,
  hasPatch: boolean,
  hasUnknown: boolean,
  traces: StrandsTrace[]
): StrandsVersion {
  // No changes = equal
  if (traces.length === 0) {
    return 'equal';
  }

  // If there are unknown changes, we can't determine version
  if (hasUnknown && !hasBreaking && !hasNonBreaking) {
    return null;
  }

  // Priority: breaking > non-breaking > patch
  if (hasBreaking) {
    return 'major';
  }

  if (hasNonBreaking) {
    return 'minor';
  }

  if (hasPatch) {
    return 'patch';
  }

  // Only unknown changes
  return null;
}

/**
 * Compute the new semantic version based on current version and bump level
 */
function computeNewVersion(
  currentVersion: string,
  bumpLevel: StrandsVersion
): SemanticVersion | null {
  if (bumpLevel === null || bumpLevel === 'equal') {
    // Parse current version and return as-is for equal
    const parsed = parseVersion(currentVersion);
    if (!parsed) return null;
    return bumpLevel === 'equal' ? parsed : null;
  }

  const parsed = parseVersion(currentVersion);
  if (!parsed) {
    return null;
  }

  let { major, minor, patch } = parsed;

  switch (bumpLevel) {
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'patch':
      patch += 1;
      break;
  }

  return {
    major,
    minor,
    patch,
    version: `${major}.${minor}.${patch}`,
  };
}

/**
 * Parse a semver string into components
 */
function parseVersion(version: string): SemanticVersion | null {
  // Remove 'v' prefix if present
  const cleaned = version.startsWith('v') ? version.slice(1) : version;

  // Match semver pattern (with optional prerelease/build)
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  const major = parseInt(match[1]!, 10);
  const minor = parseInt(match[2]!, 10);
  const patch = parseInt(match[3]!, 10);

  return {
    major,
    minor,
    patch,
    version: `${major}.${minor}.${patch}`,
  };
}

/**
 * Compare two JSON Schema objects and return a simple compatibility result
 *
 * Convenience function for quick compatibility checks.
 *
 * @param sourceSchema - The source (old/baseline) schema object
 * @param targetSchema - The target (new/current) schema object
 * @returns 'compatible' | 'incompatible' | 'unknown'
 */
export function checkCompatibility(
  sourceSchema: unknown,
  targetSchema: unknown
): StrandsCompatibility {
  const result = compareSchemas(sourceSchema, targetSchema);

  // If any trace is incompatible, overall is incompatible
  if (result.traces.some((t) => t.compatibility === 'incompatible')) {
    return 'incompatible';
  }

  // If any trace is unknown, overall is unknown
  if (result.traces.some((t) => t.compatibility === 'unknown')) {
    return 'unknown';
  }

  // All compatible
  return 'compatible';
}

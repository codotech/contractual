/**
 * Changeset creation utilities
 * Creates changeset files from diff results
 */

import type { DiffResult, BumpType, ChangeSeverity } from '@contractual/types';
import { generateChangesetName } from './naming.js';

/**
 * Result of creating a changeset file
 */
export interface CreateChangesetResult {
  /** Generated filename (e.g., "brave-tigers-fly.md") */
  filename: string;
  /** Full content of the changeset file including frontmatter and body */
  content: string;
}

/**
 * Severity label mapping for display purposes
 */
const SEVERITY_LABELS: Record<ChangeSeverity, string> = {
  breaking: 'BREAKING',
  'non-breaking': 'minor',
  patch: 'patch',
  unknown: 'unknown',
} as const;

/**
 * Map change severity to display label
 */
function severityToLabel(severity: ChangeSeverity): string {
  return SEVERITY_LABELS[severity];
}

/**
 * Determine the suggested bump type for a contract based on its changes
 */
function determineBumpType(result: DiffResult): BumpType {
  if (result.summary.breaking > 0) {
    return 'major';
  }
  if (result.summary.nonBreaking > 0) {
    return 'minor';
  }
  return 'patch';
}

/**
 * Create a changeset from diff results
 *
 * @param results - Array of diff results from comparing specs
 * @param overrides - Optional map of contract name to bump type overrides
 * @returns Object with filename and content for the changeset file
 */
export function createChangeset(
  results: DiffResult[],
  overrides?: Readonly<Record<string, BumpType>>
): CreateChangesetResult {
  const filename = `${generateChangesetName()}.md`;

  // Build YAML frontmatter
  const bumps: Record<string, BumpType> = {};
  for (const result of results) {
    if (result.changes.length === 0) {
      continue;
    }
    const suggestedBump = determineBumpType(result);
    bumps[result.contract] = overrides?.[result.contract] ?? suggestedBump;
  }

  // Generate YAML frontmatter
  const yamlLines = Object.entries(bumps).map(
    ([contract, bump]) => `"${contract}": ${bump}`
  );
  const frontmatter = `---\n${yamlLines.join('\n')}\n---`;

  // Generate markdown body with changes grouped by contract
  const bodyParts: string[] = [];

  for (const result of results) {
    if (result.changes.length === 0) {
      continue;
    }

    bodyParts.push(`## ${result.contract}`);
    bodyParts.push('');

    for (const change of result.changes) {
      const label = severityToLabel(change.severity);
      bodyParts.push(`- **[${label}]** ${change.message}`);
    }

    bodyParts.push('');
  }

  const body = bodyParts.join('\n').trim();
  const content = `${frontmatter}\n\n${body}\n`;

  return { filename, content };
}

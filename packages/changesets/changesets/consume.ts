/**
 * Changeset consumption utilities
 * Processes changesets for the version command
 */

import type { BumpType, ChangesetFile } from '@contractual/types';

/**
 * Bump type priority for comparison (higher = more significant)
 */
const BUMP_PRIORITY: Readonly<Record<BumpType, number>> = {
  major: 3,
  minor: 2,
  patch: 1,
} as const;

/**
 * Compare two bump types and return the higher priority one
 */
function higherBump(a: BumpType, b: BumpType): BumpType {
  return BUMP_PRIORITY[a] >= BUMP_PRIORITY[b] ? a : b;
}

/**
 * Aggregate bumps from multiple changesets
 * For each contract, the highest bump type wins
 *
 * @param changesets - Array of parsed changeset files
 * @returns Map of contract name to aggregated bump type
 */
export function aggregateBumps(
  changesets: readonly ChangesetFile[]
): Record<string, BumpType> {
  const aggregated: Record<string, BumpType> = {};

  for (const changeset of changesets) {
    for (const [contract, bump] of Object.entries(changeset.bumps)) {
      const existing = aggregated[contract];
      aggregated[contract] = existing ? higherBump(existing, bump) : bump;
    }
  }

  return aggregated;
}

/**
 * Extract the markdown section for a specific contract from changesets
 * Combines all change descriptions for the contract across all changesets
 *
 * @param changesets - Array of parsed changeset files
 * @param contractName - Name of the contract to extract changes for
 * @returns Combined markdown content for the contract
 */
export function extractContractChanges(
  changesets: readonly ChangesetFile[],
  contractName: string
): string {
  const sections: string[] = [];

  for (const changeset of changesets) {
    // Only process changesets that affect this contract
    if (!(contractName in changeset.bumps)) {
      continue;
    }

    // Extract the section for this contract from the body
    const section = extractSectionFromBody(changeset.body, contractName);
    if (section) {
      sections.push(section);
    }
  }

  return sections.join('\n\n');
}

/**
 * Extract a contract's section from a changeset body
 * Looks for ## ContractName and extracts content until the next ## or end
 */
function extractSectionFromBody(body: string, contractName: string): string {
  const lines = body.split('\n');
  const headerPattern = new RegExp(`^##\\s+${escapeRegex(contractName)}\\s*$`);

  let inSection = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    if (headerPattern.test(line)) {
      inSection = true;
      continue;
    }

    if (inSection) {
      // Check if we've hit the next section
      if (line.startsWith('## ')) {
        break;
      }
      sectionLines.push(line);
    }
  }

  return sectionLines.join('\n').trim();
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

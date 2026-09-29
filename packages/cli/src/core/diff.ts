/**
 * Core diffing logic
 *
 * Shared module for running diffs across contracts.
 * Used by `diff`, `breaking`, and `changeset` commands.
 */

import type { ResolvedConfig, ResolvedContract, DiffResult } from '@contractual/types';
import { getDiffer } from '../governance/index.js';
import { findContractualDir, getSnapshotPath } from '../utils/files.js';

export interface DiffOptions {
  /** Filter to specific contract names */
  contracts?: string[];
  /** Include contracts with no changes in results */
  includeEmpty?: boolean;
}

export interface DiffContractsResult {
  results: DiffResult[];
  contractualDir: string;
}

/**
 * Core diffing function. Runs the appropriate differ for each contract,
 * comparing current spec against last versioned snapshot.
 *
 * Returns classified changes for all contracts.
 * This is the primitive that `diff`, `breaking`, and `changeset` all use.
 */
export async function diffContracts(
  config: ResolvedConfig,
  options: DiffOptions = {}
): Promise<DiffContractsResult> {
  const contractualDir = findContractualDir(config.configDir);
  if (!contractualDir) {
    throw new Error('No .contractual directory found. Run `contractual init` first.');
  }

  // Filter contracts if specific ones requested
  let contracts: ResolvedContract[] = config.contracts;
  if (options.contracts && options.contracts.length > 0) {
    contracts = config.contracts.filter((c) => options.contracts!.includes(c.name));

    // Check for missing contracts
    for (const name of options.contracts) {
      if (!config.contracts.some((c) => c.name === name)) {
        throw new Error(`Contract "${name}" not found in configuration.`);
      }
    }
  }

  const results: DiffResult[] = [];

  for (const contract of contracts) {
    const result = await diffSingleContract(contract, contractualDir);

    // Include result if it has changes, or if includeEmpty is true
    if (result.changes.length > 0 || options.includeEmpty) {
      results.push(result);
    }
  }

  return { results, contractualDir };
}

/**
 * Diff a single contract against its snapshot
 */
async function diffSingleContract(
  contract: ResolvedContract,
  contractualDir: string
): Promise<DiffResult> {
  // Get snapshot path
  const snapshotPath = getSnapshotPath(contract.name, contractualDir);

  // No snapshot = first version, no changes
  if (!snapshotPath) {
    return createEmptyResult(contract.name, 'first-version');
  }

  // Check if breaking detection is disabled
  if (contract.breaking === false) {
    return createEmptyResult(contract.name, 'disabled');
  }

  // Get the differ from the registry
  const differ = getDiffer(contract.type, contract.breaking);

  if (differ === null) {
    throw new Error(
      `No differ available for ${contract.type} contract "${contract.name}". Configure a custom breaking command or set breaking: false explicitly.`
    );
  }

  if (!differ) {
    // No differ registered for this type
    return createEmptyResult(contract.name, 'no-differ');
  }

  // Run the differ: snapshot (old) vs current spec (new)
  const diffResult = await differ(snapshotPath, contract.absolutePath);

  // Override contract name to match config
  return {
    ...diffResult,
    contract: contract.name,
  };
}

/**
 * Create an empty diff result
 */
function createEmptyResult(
  contractName: string,
  _reason: 'first-version' | 'disabled' | 'no-differ'
): DiffResult {
  return {
    contract: contractName,
    changes: [],
    summary: {
      breaking: 0,
      nonBreaking: 0,
      patch: 0,
      unknown: 0,
    },
    suggestedBump: 'none',
  };
}

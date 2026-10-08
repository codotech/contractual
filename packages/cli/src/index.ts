// Public API for programmatic use
export { loadConfig, ConfigError } from './config/index.js';
export { registerLinter, registerDiffer, getLinter, getDiffer } from './governance/index.js';

// Core diffing
export { diffContracts } from './core/diff.js';
export type { DiffOptions, DiffContractsResult } from './core/diff.js';

// File utilities
export {
  findContractualDir,
  getSnapshotPath,
  copyToSnapshots,
  CONTRACTUAL_DIR,
} from './utils/files.js';

// Re-export from @contractual/changesets
export {
  VersionManager,
  PreReleaseManager,
  createChangeset,
  readChangesets,
  aggregateBumps,
  generateChangesetName,
  extractContractChanges,
  appendChangelog,
  incrementVersion,
  incrementVersionWithPreRelease,
  VERSIONS_FILE,
  SNAPSHOTS_DIR,
  CHANGESETS_DIR,
  PRE_RELEASE_FILE,
  updateSpecVersion,
} from '@contractual/changesets';
export type { BumpOperationResult } from '@contractual/changesets';

// Re-export types from @contractual/types
export type * from '@contractual/types';

// Changesets
export {
  generateChangesetName,
  generateUniqueChangesetName,
} from './changesets/naming.js';
export { createChangeset, type CreateChangesetResult } from './changesets/create.js';
export {
  parseChangeset,
  readChangesets,
  ChangesetParseError,
  type ParsedChangesetContent,
} from './changesets/read.js';
export { aggregateBumps, extractContractChanges } from './changesets/consume.js';

// Versioning
export {
  VersionManager,
  PreReleaseManager,
  VERSIONS_FILE,
  SNAPSHOTS_DIR,
  CHANGESETS_DIR,
  PRE_RELEASE_FILE,
  DEFAULT_VERSION,
  SPEC_EXTENSIONS,
  incrementVersion,
  incrementVersionWithPreRelease,
  VersionError,
  type BumpOperationResult,
} from './versioning/manager.js';
export { formatDate, appendChangelog } from './versioning/changelog.js';
export { updateSpecVersion } from './versioning/spec-updater.js';

/**
 * Supported contract types in Contractual.
 *
 * @remarks
 * - `openapi` - OpenAPI 3.x specifications
 * - `json-schema` - JSON Schema (Draft-07, 2019-09, 2020-12)
 * - `asyncapi` - AsyncAPI 2.x/3.x specifications
 * - `odcs` - Open Data Contract Standard v3.x
 */
export type ContractType = 'openapi' | 'json-schema' | 'asyncapi' | 'odcs';

/**
 * All valid contract type values as a readonly array.
 * Useful for runtime validation and iteration.
 */
export const CONTRACT_TYPES = [
  'openapi',
  'json-schema',
  'asyncapi',
  'odcs',
] as const satisfies readonly ContractType[];

/**
 * Definition of a single contract in the configuration file.
 *
 * @example
 * ```yaml
 * contracts:
 *   - name: orders-api
 *     type: openapi
 *     path: ./specs/orders.openapi.yaml
 * ```
 */
export interface ContractDefinition {
  /** Unique identifier for the contract, used in changeset files and version history */
  name: string;
  /** Type of schema format */
  type: ContractType;
  /** Path to spec file, relative to config (can be glob pattern) */
  path: string;
  /** Override linter: tool name, custom command with {spec} placeholder, or false to disable */
  lint?: string | false;
  /** Override differ: tool name, custom command with {old} {new} placeholders, or false to disable */
  breaking?: string | false;
  /** Sync version field inside the spec file on version bump (default: true). Set to false to skip. */
  syncVersion?: boolean;
  /** Output generation commands (Phase 2) */
  generate?: string[];
}

/**
 * Changeset behavior configuration.
 */
export interface ChangesetConfig {
  /** Auto-detect change classifications from structural diff (default: true) */
  autoDetect?: boolean;
  /** Require changeset for spec changes in PRs (default: true) */
  requireOnPR?: boolean;
}

/**
 * AI provider types supported by Contractual.
 */
export type AIProvider = 'anthropic';

/**
 * AI feature toggles.
 */
export interface AIFeatures {
  /** Enable PR change explanations */
  explain?: boolean;
  /** Enable AI-enriched changelog entries */
  changelog?: boolean;
  /** Enable spec metadata enhancement (auto-fill descriptions, examples) */
  enhance?: boolean;
}

/**
 * AI/LLM integration configuration.
 *
 * @remarks
 * All AI features gracefully degrade when no API key is provided.
 */
export interface AIConfig {
  /** AI provider (only 'anthropic' supported currently) */
  provider?: AIProvider;
  /** Model identifier to use */
  model?: string;
  /** Feature toggles */
  features?: AIFeatures;
}

/**
 * Versioning mode for contracts.
 *
 * - `independent` - Each contract has its own version (like Lerna independent mode)
 * - `fixed` - All contracts share the same version
 */
export type VersioningMode = 'independent' | 'fixed';

/**
 * Versioning configuration.
 */
export interface VersioningConfig {
  /** Versioning mode (default: 'independent') */
  mode: VersioningMode;
}

/**
 * Root configuration for contractual.yaml.
 *
 * @example
 * ```yaml
 * contracts:
 *   - name: orders-api
 *     type: openapi
 *     path: ./specs/orders.openapi.yaml
 *
 * ai:
 *   features:
 *     explain: true
 *     changelog: true
 * ```
 */
export interface ContractualConfig {
  /** List of contract definitions */
  contracts: ContractDefinition[];
  /** Versioning configuration */
  versioning?: VersioningConfig;
  /** Changeset behavior configuration */
  changeset?: ChangesetConfig;
  /** AI/LLM integration configuration */
  ai?: AIConfig;
}

/**
 * Resolved contract with absolute paths and validated data.
 */
export interface ResolvedContract extends ContractDefinition {
  /** Absolute path to the spec file */
  absolutePath: string;
}

/**
 * Fully resolved configuration with absolute paths.
 */
export interface ResolvedConfig extends Omit<ContractualConfig, 'contracts'> {
  /** Resolved contracts with absolute paths */
  contracts: ResolvedContract[];
  /** Directory containing contractual.yaml */
  configDir: string;
  /** Absolute path to contractual.yaml */
  configPath: string;
}

/**
 * Type guard to check if a string is a valid ContractType.
 *
 * @param value - The value to check
 * @returns True if the value is a valid ContractType
 */
export function isContractType(value: unknown): value is ContractType {
  return typeof value === 'string' && CONTRACT_TYPES.includes(value as ContractType);
}

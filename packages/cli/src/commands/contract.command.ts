import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import chalk from 'chalk';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { VersionManager, updateSpecVersion } from '@contractual/changesets';
import { loadConfig } from '../config/index.js';
import {
  ensureContractualDir,
  detectSpecType,
  CONTRACTUAL_DIR,
  findContractualDir,
} from '../utils/files.js';
import {
  promptInput,
  promptSelect,
  promptVersion,
  CONTRACT_TYPE_CHOICES,
  type PromptOptions,
} from '../utils/prompts.js';
import type { ContractDefinition, ContractType } from '@contractual/types';

/**
 * Default version for new contracts
 */
const DEFAULT_VERSION = '0.0.0';

/**
 * Options for the contract add command
 */
interface ContractAddOptions extends PromptOptions {
  /** Contract name */
  name?: string;
  /** Contract type */
  type?: ContractType;
  /** Path to spec file */
  path?: string;
  /** Initial version */
  initialVersion?: string;
  /** Skip validation */
  skipValidation?: boolean;
}

/**
 * Add a new contract to the configuration
 */
export async function contractAddCommand(options: ContractAddOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const configPath = join(cwd, 'contractual.yaml');

  // Check if initialized
  if (!existsSync(configPath)) {
    console.log(chalk.red('Not initialized:') + ' contractual.yaml not found');
    console.log(chalk.dim('Run `contractual init` first'));
    process.exitCode = 1;
    return;
  }

  // Read existing config
  const configContent = readFileSync(configPath, 'utf-8');
  const config = parseYaml(configContent) as {
    contracts?: ContractDefinition[];
    changeset?: unknown;
    versioning?: unknown;
    ai?: unknown;
  };

  if (!config.contracts) {
    config.contracts = [];
  }

  // Get contract details through prompts or options
  const contractName = await getContractName(config.contracts, options);
  if (!contractName) return;

  const specPath = await getSpecPath(cwd, options);
  if (!specPath) return;

  const contractType = await getContractType(cwd, specPath, options);
  if (!contractType) return;

  const version = await getVersion(options);

  // Validate spec file
  if (!options.skipValidation) {
    const absolutePath = resolve(cwd, specPath);
    const detectedType = detectSpecType(absolutePath);

    if (!detectedType) {
      console.log(chalk.red('Invalid spec file:') + ' Could not detect spec type');
      console.log(chalk.dim(`Expected: ${contractType}`));
      process.exitCode = 1;
      return;
    }

    if (detectedType !== contractType) {
      console.log(
        chalk.yellow('Type mismatch:') +
          ` Detected ${chalk.cyan(detectedType)}, specified ${chalk.cyan(contractType)}`
      );
      console.log(chalk.dim('Use --skip-validation to override'));
      process.exitCode = 1;
      return;
    }

    console.log(chalk.green('✓') + ` Valid ${contractType} spec`);
  }

  // Create contract definition
  const contract: ContractDefinition = {
    name: contractName,
    type: contractType,
    path: specPath,
  };

  // Add to config
  config.contracts.push(contract);

  // Write updated config
  const yamlContent = stringifyYaml(config, {
    lineWidth: 100,
    singleQuote: true,
  });
  writeFileSync(configPath, yamlContent, 'utf-8');

  // Ensure .contractual directory exists and create snapshot
  const contractualDir = findContractualDir(cwd) ?? join(cwd, CONTRACTUAL_DIR);
  ensureContractualDir(cwd);

  const versionManager = new VersionManager(contractualDir);
  const absolutePath = resolve(cwd, specPath);
  updateSpecVersion(absolutePath, version, contractType);
  versionManager.setVersion(contractName, version, absolutePath);

  // Print summary
  const snapshotExt = extname(specPath) || '.yaml';
  console.log();
  console.log(
    chalk.green('✓') + ` Added ${chalk.cyan(contractName)} (${contractType}) at v${version}`
  );
  console.log();
  console.log(chalk.bold('Updated:'));
  console.log(`  ${chalk.yellow('~')} contractual.yaml`);
  console.log(chalk.bold('Created:'));
  console.log(`  ${chalk.green('+')} .contractual/snapshots/${contractName}${snapshotExt}`);
  console.log(`  ${chalk.green('+')} .contractual/versions.json (updated)`);
}

/**
 * Get contract name through prompts or options
 */
async function getContractName(
  existingContracts: ContractDefinition[],
  options: ContractAddOptions
): Promise<string | null> {
  const existingNames = new Set(existingContracts.map((c) => c.name));

  if (options.name) {
    if (existingNames.has(options.name)) {
      console.log(chalk.red('Contract exists:') + ` ${options.name} already defined`);
      process.exitCode = 1;
      return null;
    }
    return options.name;
  }

  const name = await promptInput('Contract name:', '', options);

  if (!name) {
    console.log(chalk.red('Contract name is required'));
    process.exitCode = 1;
    return null;
  }

  if (existingNames.has(name)) {
    console.log(chalk.red('Contract exists:') + ` ${name} already defined`);
    process.exitCode = 1;
    return null;
  }

  // Validate name format (alphanumeric, hyphens, underscores)
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
    console.log(
      chalk.red('Invalid name:') +
        ' Must start with letter, contain only letters, numbers, hyphens, underscores'
    );
    process.exitCode = 1;
    return null;
  }

  return name;
}

/**
 * Get spec path through prompts or options
 */
async function getSpecPath(cwd: string, options: ContractAddOptions): Promise<string | null> {
  if (options.path) {
    const absolutePath = resolve(cwd, options.path);
    if (!existsSync(absolutePath)) {
      console.log(chalk.red('File not found:') + ` ${options.path}`);
      process.exitCode = 1;
      return null;
    }
    return options.path;
  }

  const path = await promptInput('Path to spec file:', '', options);

  if (!path) {
    console.log(chalk.red('Spec path is required'));
    process.exitCode = 1;
    return null;
  }

  const absolutePath = resolve(cwd, path);
  if (!existsSync(absolutePath)) {
    console.log(chalk.red('File not found:') + ` ${path}`);
    process.exitCode = 1;
    return null;
  }

  return path;
}

/**
 * Get contract type through prompts or options
 */
async function getContractType(
  cwd: string,
  specPath: string,
  options: ContractAddOptions
): Promise<ContractType | null> {
  if (options.type) {
    return options.type;
  }

  // Try to auto-detect type
  const absolutePath = resolve(cwd, specPath);
  const detectedType = detectSpecType(absolutePath);

  if (detectedType && options.yes) {
    return detectedType;
  }

  const typeChoices = CONTRACT_TYPE_CHOICES.map((c) => ({
    ...c,
    name: detectedType === c.value ? `${c.name} (detected)` : c.name,
  }));

  return promptSelect('Contract type:', [...typeChoices], detectedType ?? 'openapi', options);
}

/**
 * Get version through prompts or options
 */
async function getVersion(options: ContractAddOptions): Promise<string> {
  if (options.initialVersion) {
    return options.initialVersion;
  }

  return promptVersion('Initial version:', DEFAULT_VERSION, options);
}

/**
 * Options for the contract list command
 */
interface ContractListOptions {
  /** Output as JSON */
  json?: boolean;
}

/**
 * Contract info for list output
 */
interface ContractInfo {
  name: string;
  type: ContractType;
  version: string;
  path: string;
}

/**
 * List contracts
 */
export async function contractListCommand(
  name: string | undefined,
  options: ContractListOptions = {}
): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red('Failed to load configuration:'), message);
    process.exitCode = 1;
    return;
  }

  const contractualDir = findContractualDir(config.configDir);
  const versionManager = contractualDir ? new VersionManager(contractualDir) : null;

  // Build contract info list
  let contracts: ContractInfo[] = config.contracts.map((c) => ({
    name: c.name,
    type: c.type,
    version: versionManager?.getVersion(c.name) ?? '0.0.0',
    path: c.path,
  }));

  // Filter by name if provided
  if (name) {
    contracts = contracts.filter((c) => c.name === name);
    if (contracts.length === 0) {
      console.error(chalk.red(`Contract not found: ${name}`));
      process.exitCode = 1;
      return;
    }
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify(contracts, null, 2));
    return;
  }

  // Table output
  if (contracts.length === 0) {
    console.log(chalk.dim('No contracts configured.'));
    return;
  }

  // Calculate column widths
  const maxNameLen = Math.max(4, ...contracts.map((c) => c.name.length));
  const maxTypeLen = Math.max(4, ...contracts.map((c) => c.type.length));
  const maxVersionLen = Math.max(7, ...contracts.map((c) => c.version.length));

  // Header
  const header =
    `${'Name'.padEnd(maxNameLen)}  ` +
    `${'Type'.padEnd(maxTypeLen)}  ` +
    `${'Version'.padEnd(maxVersionLen)}  ` +
    `Path`;
  console.log(chalk.dim(header));
  console.log(chalk.dim('─'.repeat(header.length + 10)));

  // Rows
  for (const contract of contracts) {
    const typeColor = getTypeColor(contract.type);
    console.log(
      `${chalk.cyan(contract.name.padEnd(maxNameLen))}  ` +
        `${typeColor(contract.type.padEnd(maxTypeLen))}  ` +
        `${chalk.green(contract.version.padEnd(maxVersionLen))}  ` +
        `${chalk.dim(contract.path)}`
    );
  }
}

/**
 * Get chalk color function for contract type
 */
function getTypeColor(type: ContractType): (text: string) => string {
  switch (type) {
    case 'openapi':
      return chalk.green;
    case 'asyncapi':
      return chalk.magenta;
    case 'json-schema':
      return chalk.blue;
    case 'odcs':
      return chalk.yellow;
    default:
      return chalk.white;
  }
}

import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import fg from 'fast-glob';
import chalk from 'chalk';
import ora from 'ora';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { VersionManager } from '@contractual/changesets';
import {
  ensureContractualDir,
  detectSpecType,
  CONTRACTUAL_DIR,
  getSnapshotPath,
} from '../utils/files.js';
import {
  promptSelect,
  promptVersion,
  promptConfirm,
  VERSION_CHOICES,
  VERSIONING_MODE_CHOICES,
  type PromptOptions,
} from '../utils/prompts.js';
import type { ContractDefinition, ContractType, VersioningMode } from '@contractual/types';

/**
 * Default starting version for new contracts
 */
const DEFAULT_VERSION = '0.0.0';

/**
 * Default versioning mode
 */
const DEFAULT_VERSIONING_MODE: VersioningMode = 'independent';

/**
 * Options for the init command
 */
interface InitOptions extends PromptOptions {
  /** Initial version for contracts */
  initialVersion?: string;
  /** Versioning mode */
  versioning?: VersioningMode;
  /** Force reinitialize */
  force?: boolean;
}

/**
 * Glob patterns to find spec files
 */
const SPEC_PATTERNS = [
  '**/*.openapi.yaml',
  '**/*.openapi.yml',
  '**/*.openapi.json',
  '**/openapi.yaml',
  '**/openapi.yml',
  '**/openapi.json',
  '**/*.asyncapi.yaml',
  '**/*.asyncapi.yml',
  '**/*.asyncapi.json',
  '**/*.schema.json',
  '**/*.odcs.yaml',
  '**/*.odcs.yml',
];

/**
 * Directories to ignore when scanning
 */
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.contractual/**',
];

/**
 * Extract contract name from file path
 * Uses the filename stem without extension patterns
 */
function extractContractName(filePath: string): string {
  const base = basename(filePath);

  // Remove known suffixes and extensions
  let name = base
    .replace(/\.openapi\.(ya?ml|json)$/i, '')
    .replace(/\.asyncapi\.(ya?ml|json)$/i, '')
    .replace(/\.schema\.json$/i, '')
    .replace(/\.odcs\.ya?ml$/i, '')
    .replace(/\.(ya?ml|json)$/i, '');

  // Handle generic names like "openapi" -> use parent directory name
  if (['openapi', 'asyncapi', 'schema', 'spec', 'api'].includes(name.toLowerCase())) {
    const parts = filePath.split('/');
    if (parts.length >= 2) {
      name = parts[parts.length - 2];
    }
  }

  return name;
}

/**
 * Get initial version through prompts or options
 */
async function getInitialVersion(options: InitOptions): Promise<string> {
  // If version provided via CLI, use it
  if (options.initialVersion) {
    return options.initialVersion;
  }

  // Prompt for version
  const versionChoice = await promptSelect(
    'Initial version for contracts:',
    [...VERSION_CHOICES],
    '0.0.0',
    options
  );

  if (versionChoice === 'custom') {
    return promptVersion('Enter version:', DEFAULT_VERSION, options);
  }

  return versionChoice;
}

/**
 * Get versioning mode through prompts or options
 */
async function getVersioningMode(options: InitOptions): Promise<VersioningMode> {
  if (options.versioning) {
    return options.versioning;
  }

  return promptSelect(
    'Versioning mode:',
    [...VERSIONING_MODE_CHOICES],
    DEFAULT_VERSIONING_MODE,
    options
  );
}

/**
 * Initialize Contractual in a repository
 *
 * Scans for spec files and generates contractual.yaml configuration
 */
export async function initCommand(options: InitOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const configPath = join(cwd, 'contractual.yaml');
  const contractualDir = join(cwd, CONTRACTUAL_DIR);

  // Check if already initialized
  if (existsSync(configPath) && !options.force) {
    // Try to handle existing project with uninitialized contracts
    await handleExistingProject(cwd, configPath, contractualDir, options);
    return;
  }

  const spinner = ora('Scanning for spec files...').start();

  try {
    // Scan for spec files
    const files = await fg(SPEC_PATTERNS, {
      cwd,
      ignore: IGNORE_PATTERNS,
      absolute: false,
      onlyFiles: true,
    });

    spinner.succeed(`Found ${files.length} potential spec file(s)`);

    // Build contract definitions
    const contracts: ContractDefinition[] = [];
    const seenNames = new Set<string>();

    for (const filePath of files) {
      const absolutePath = join(cwd, filePath);
      const detectedType = detectSpecType(absolutePath);

      if (!detectedType) {
        continue;
      }

      let name = extractContractName(filePath);

      // Ensure unique names
      if (seenNames.has(name)) {
        let counter = 2;
        while (seenNames.has(`${name}-${counter}`)) {
          counter++;
        }
        name = `${name}-${counter}`;
      }
      seenNames.add(name);

      contracts.push({
        name,
        type: detectedType,
        path: filePath,
      });
    }

    if (contracts.length === 0) {
      console.log(chalk.yellow('\nNo spec files found'));
      console.log(chalk.dim('\nSupported file patterns:'));
      console.log(chalk.dim('  - *.openapi.yaml/json'));
      console.log(chalk.dim('  - *.asyncapi.yaml/json'));
      console.log(chalk.dim('  - *.schema.json'));
      console.log(chalk.dim('  - *.odcs.yaml'));
      console.log(chalk.dim('\nYou can manually create contractual.yaml to define contracts.'));
      return;
    }

    // Show found contracts
    console.log();
    for (const contract of contracts) {
      const typeColor = getTypeColor(contract.type);
      console.log(
        `  ${chalk.dim('Found:')} ${contract.path} ${chalk.dim('(')}${typeColor(contract.type)}${chalk.dim(')')}`
      );
    }
    console.log();

    // Get version and mode through prompts
    const initialVersion = await getInitialVersion(options);
    const versioningMode = await getVersioningMode(options);

    // Generate config
    const config: Record<string, unknown> = {
      contracts,
      changeset: {
        autoDetect: true,
        requireOnPR: true,
      },
    };

    // Only add versioning section if not using defaults
    if (versioningMode !== 'independent') {
      config.versioning = {
        mode: versioningMode,
      };
    }

    // Write contractual.yaml
    const yamlContent = stringifyYaml(config, {
      lineWidth: 100,
      singleQuote: true,
    });
    writeFileSync(configPath, yamlContent, 'utf-8');

    // Create .contractual directory structure
    const createdDir = ensureContractualDir(cwd);

    // Create snapshots and set initial versions
    const versionManager = new VersionManager(createdDir);
    for (const contract of contracts) {
      const absolutePath = join(cwd, contract.path);
      versionManager.setVersion(contract.name, initialVersion, absolutePath);
    }

    // Print summary
    console.log();
    console.log(chalk.green('✓') + ' Initialized Contractual');
    console.log();
    console.log(chalk.bold('Created:'));
    console.log(`  ${chalk.green('+')} contractual.yaml`);
    console.log(`  ${chalk.green('+')} .contractual/`);
    console.log(`  ${chalk.green('+')} .contractual/changesets/`);
    console.log(`  ${chalk.green('+')} .contractual/snapshots/`);
    console.log(`  ${chalk.green('+')} .contractual/versions.json`);

    console.log();
    console.log(chalk.bold(`Detected ${contracts.length} contract(s) at v${initialVersion}:`));

    for (const contract of contracts) {
      const typeColor = getTypeColor(contract.type);
      console.log(
        `  ${chalk.cyan(contract.name)} ${chalk.dim('(')}${typeColor(contract.type)}${chalk.dim(')')}`
      );
      console.log(`    ${chalk.dim(contract.path)}`);
    }

    if (versioningMode !== 'independent') {
      console.log();
      console.log(chalk.dim(`Versioning mode: ${versioningMode}`));
    }

    console.log();
    console.log(chalk.dim('Next steps:'));
    console.log(chalk.dim('  1. Run `contractual lint` to validate your specs'));
    console.log(chalk.dim('  2. Make changes to your specs'));
    console.log(chalk.dim('  3. Run `contractual diff` to see changes'));
    console.log(chalk.dim('  4. Run `contractual changeset` to record changes'));
  } catch (error) {
    spinner.fail('Initialization failed');
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red(message));
    process.exitCode = 1;
  }
}

/**
 * Handle existing project - initialize uninitialized contracts
 */
async function handleExistingProject(
  cwd: string,
  configPath: string,
  contractualDir: string,
  options: InitOptions
): Promise<void> {
  // Read existing config
  const configContent = readFileSync(configPath, 'utf-8');
  const config = parseYaml(configContent) as { contracts?: ContractDefinition[] };

  if (!config.contracts || config.contracts.length === 0) {
    console.log(chalk.red('Already initialized:') + ' contractual.yaml exists');
    console.log(chalk.dim('Use `contractual status` to see current state'));
    process.exitCode = 1;
    return;
  }

  // Ensure .contractual directory exists
  ensureContractualDir(cwd);

  // Find contracts without snapshots
  const uninitializedContracts: ContractDefinition[] = [];
  for (const contract of config.contracts) {
    const snapshotPath = getSnapshotPath(contract.name, contractualDir);
    if (!snapshotPath) {
      uninitializedContracts.push(contract);
    }
  }

  if (uninitializedContracts.length === 0) {
    console.log(chalk.yellow('Already initialized:') + ' contractual.yaml exists');
    console.log(chalk.dim('All contracts have snapshots.'));
    console.log(chalk.dim('Use `contractual status` to see current state'));
    console.log(chalk.dim('Use `--force` to reinitialize'));
    return;
  }

  // Show uninitialized contracts
  console.log(
    chalk.yellow(`Found ${uninitializedContracts.length} contract(s) without version history:`)
  );
  for (const contract of uninitializedContracts) {
    console.log(
      `  ${chalk.dim('-')} ${chalk.cyan(contract.name)} ${chalk.dim(`(${contract.type})`)}`
    );
  }
  console.log();

  // Confirm initialization
  const shouldInitialize = await promptConfirm(
    `Initialize with version ${DEFAULT_VERSION}?`,
    true,
    options
  );

  if (!shouldInitialize) {
    console.log(chalk.dim('Skipped initialization'));
    return;
  }

  // Initialize uninitialized contracts
  const versionManager = new VersionManager(contractualDir);
  for (const contract of uninitializedContracts) {
    const absolutePath = join(cwd, contract.path);
    if (!existsSync(absolutePath)) {
      console.log(
        chalk.yellow(`  Skipped ${contract.name}: spec file not found at ${contract.path}`)
      );
      continue;
    }
    versionManager.setVersion(contract.name, DEFAULT_VERSION, absolutePath);
    console.log(
      chalk.green('✓') + ` Initialized ${chalk.cyan(contract.name)} at v${DEFAULT_VERSION}`
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

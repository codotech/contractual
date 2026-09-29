import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import fg from 'fast-glob';
import type { ContractualConfig, ResolvedConfig, ResolvedContract } from '@contractual/types';
import { validateConfig, formatValidationErrors } from './validator.js';

/**
 * Config file names to search for
 */
const CONFIG_FILENAMES = ['contractual.yaml', 'contractual.yml'];

/**
 * Error thrown when config cannot be loaded
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Find contractual.yaml by walking up from the given directory
 */
export function findConfigFile(startDir: string = process.cwd()): string | null {
  let currentDir = resolve(startDir);
  const root = dirname(currentDir);

  while (currentDir !== root) {
    for (const filename of CONFIG_FILENAMES) {
      const configPath = join(currentDir, filename);
      if (existsSync(configPath)) {
        return configPath;
      }
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // Check root directory too
  for (const filename of CONFIG_FILENAMES) {
    const configPath = join(currentDir, filename);
    if (existsSync(configPath)) {
      return configPath;
    }
  }

  return null;
}

/**
 * Parse YAML config file
 */
export function parseConfigFile(configPath: string): unknown {
  const content = readFileSync(configPath, 'utf-8');

  try {
    return parseYaml(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown parse error';
    throw new ConfigError(`Failed to parse ${configPath}: ${message}`);
  }
}

/**
 * Resolve contract paths to absolute paths
 */
export function resolveContractPaths(
  config: ContractualConfig,
  configDir: string
): ResolvedContract[] {
  const resolved: ResolvedContract[] = [];

  for (const contract of config.contracts) {
    const pattern = contract.path;
    const absolutePattern = resolve(configDir, pattern);

    // Check if it's a glob pattern
    if (pattern.includes('*')) {
      const matches = fg.sync(absolutePattern, { onlyFiles: true });
      if (matches.length === 0) {
        console.warn(
          `Warning: No files matched pattern "${pattern}" for contract "${contract.name}"`
        );
      }
      // For glob patterns, use the first match as the primary path
      // In the future, we might support multiple specs per contract
      if (matches.length > 0) {
        resolved.push({
          ...contract,
          absolutePath: matches[0],
        });
      }
    } else {
      // Direct file path
      if (!existsSync(absolutePattern)) {
        console.warn(`Warning: File not found "${pattern}" for contract "${contract.name}"`);
      }
      resolved.push({
        ...contract,
        absolutePath: absolutePattern,
      });
    }
  }

  return resolved;
}

/**
 * Load and validate config from a file path
 */
export function loadConfigFromPath(configPath: string): ResolvedConfig {
  const parsed = parseConfigFile(configPath);

  const validation = validateConfig(parsed);
  if (!validation.valid) {
    throw new ConfigError(
      `Invalid configuration in ${configPath}:\n${formatValidationErrors(validation.errors)}`
    );
  }

  const config = parsed as ContractualConfig;
  const configDir = dirname(configPath);
  const resolvedContracts = resolveContractPaths(config, configDir);

  return {
    ...config,
    contracts: resolvedContracts,
    configDir,
    configPath,
  };
}

/**
 * Load config by searching from the current directory
 */
export function loadConfig(startDir?: string): ResolvedConfig {
  const configPath = findConfigFile(startDir);

  if (!configPath) {
    throw new ConfigError('No contractual.yaml found. Run `contractual init` to get started.');
  }

  return loadConfigFromPath(configPath);
}

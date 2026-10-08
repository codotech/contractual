import { select, input, confirm } from '@inquirer/prompts';

/**
 * Check if running in interactive mode (TTY available)
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/**
 * Check if running in CI environment
 */
export function isCI(): boolean {
  return (
    process.env.CI === 'true' ||
    process.env.CI === '1' ||
    process.env.CONTINUOUS_INTEGRATION === 'true' ||
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.GITLAB_CI === 'true' ||
    process.env.CIRCLECI === 'true'
  );
}

/**
 * Options for prompt functions
 */
export interface PromptOptions {
  /** Skip prompts and use defaults (--yes flag) */
  yes?: boolean;
  /** Force interactive mode even in CI */
  interactive?: boolean;
}

/**
 * Determine if prompts should be shown
 */
export function shouldPrompt(options: PromptOptions): boolean {
  if (options.yes) return false;
  if (options.interactive) return true;
  if (isCI()) return false;
  return isInteractive();
}

/**
 * Prompt for a selection from a list of choices
 */
export async function promptSelect<T extends string>(
  message: string,
  choices: Array<{ value: T; name: string; description?: string }>,
  defaultValue: T,
  options: PromptOptions = {}
): Promise<T> {
  if (!shouldPrompt(options)) {
    return defaultValue;
  }

  return select({
    message,
    choices: choices.map((c) => ({
      value: c.value,
      name: c.name,
      description: c.description,
    })),
    default: defaultValue,
  });
}

/**
 * Prompt for text input
 */
export async function promptInput(
  message: string,
  defaultValue: string,
  options: PromptOptions = {}
): Promise<string> {
  if (!shouldPrompt(options)) {
    return defaultValue;
  }

  return input({
    message,
    default: defaultValue,
  });
}

/**
 * Prompt for confirmation (yes/no)
 */
export async function promptConfirm(
  message: string,
  defaultValue: boolean,
  options: PromptOptions = {}
): Promise<boolean> {
  if (!shouldPrompt(options)) {
    return defaultValue;
  }

  return confirm({
    message,
    default: defaultValue,
  });
}

/**
 * Prompt for version input with validation
 */
export async function promptVersion(
  message: string,
  defaultValue: string,
  options: PromptOptions = {}
): Promise<string> {
  if (!shouldPrompt(options)) {
    return defaultValue;
  }

  const result = await input({
    message,
    default: defaultValue,
    validate: (value) => {
      const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
      if (semverRegex.test(value)) {
        return true;
      }
      return 'Please enter a valid semver version (e.g., 0.0.0, 1.2.3-beta.1)';
    },
  });

  return result;
}

/**
 * Common version choices for init
 */
export const VERSION_CHOICES = [
  { value: '0.0.0', name: '0.0.0', description: 'Start fresh (recommended for new projects)' },
  { value: '1.0.0', name: '1.0.0', description: 'Production-ready' },
  { value: 'custom', name: 'Custom', description: 'Enter a custom version' },
] as const;

/**
 * Common versioning mode choices
 */
export const VERSIONING_MODE_CHOICES = [
  {
    value: 'independent',
    name: 'Independent',
    description: 'Each contract versioned separately',
  },
  { value: 'fixed', name: 'Fixed', description: 'All contracts share same version' },
] as const;

/**
 * Contract type choices
 */
export const CONTRACT_TYPE_CHOICES = [
  { value: 'openapi', name: 'OpenAPI', description: 'OpenAPI/Swagger specification' },
  { value: 'asyncapi', name: 'AsyncAPI', description: 'AsyncAPI specification' },
  { value: 'json-schema', name: 'JSON Schema', description: 'JSON Schema definition' },
  { value: 'odcs', name: 'ODCS', description: 'Open Data Contract Standard' },
] as const;

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
const AjvConstructor = Ajv.default ?? Ajv;
const addFormatsFunc = addFormats.default ?? addFormats;
import type { ContractualConfig } from '@contractual/types';
import configSchema from './schema.json' with { type: 'json' };

/**
 * Validation error with path and message
 */
export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Result of config validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validates a parsed config object against the JSON schema
 */
export function validateConfig(config: unknown): ValidationResult {
  const ajv = new AjvConstructor({ allErrors: true, strict: false });
  addFormatsFunc(ajv);

  const validate = ajv.compile(configSchema);
  const valid = validate(config);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors: ValidationError[] = (validate.errors ?? []).map((err) => ({
    path: err.instancePath || '/',
    message: err.message ?? 'Unknown validation error',
  }));

  return { valid: false, errors };
}

/**
 * Type guard to check if config is valid ContractualConfig
 */
export function isValidConfig(config: unknown): config is ContractualConfig {
  return validateConfig(config).valid;
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map((err) => `  ${err.path}: ${err.message}`).join('\n');
}

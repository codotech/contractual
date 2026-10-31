/**
 * JSON Schema Linter using ajv + custom rules
 *
 * Two-phase linting:
 * 1. Meta-validation: Validates that the schema is itself valid JSON Schema (ajv)
 * 2. Style rules: Checks for best practices, anti-patterns, and quality (custom rules)
 *
 * @see https://github.com/sourcemeta/jsonschema
 * @see https://github.com/orgs/json-schema-org/discussions/323
 */

import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { LintResult, LintIssue, LintOptions } from '@contractual/types';
import { runLintRules } from './json-schema-rules.js';
import type { SchemaNode } from './json-schema-rules.js';

const AjvConstructor = Ajv.default ?? Ajv;
const addFormatsFunc = addFormats.default ?? addFormats;

/**
 * Options for JSON Schema linting (extends base LintOptions)
 */
export interface JsonSchemaLintOptions extends LintOptions {
  /** Rules to enable (if not specified, all rules are enabled) */
  enabledRules?: Set<string>;
  /** Rules to disable */
  disabledRules?: Set<string>;
  /** Skip meta-validation (ajv) */
  skipMetaValidation?: boolean;
  /** Skip style rules */
  skipStyleRules?: boolean;
}

/**
 * Lint a JSON Schema using ajv meta-validation and custom style rules
 *
 * @param specPath - Path to the JSON Schema file
 * @param options - Linting options
 * @returns Lint result with errors and warnings
 */
export async function lintJsonSchema(
  specPath: string,
  options: JsonSchemaLintOptions = {}
): Promise<LintResult> {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];

  let schema: SchemaNode;

  try {
    const content = await readFile(specPath, 'utf-8');
    schema = JSON.parse(content) as SchemaNode;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error reading schema';

    errors.push({
      path: '/',
      message: `Failed to read or parse schema: ${message}`,
      rule: 'parse-error',
      severity: 'error',
    });

    return { contract: '', specPath, errors, warnings };
  }

  // Phase 1: Meta-validation using ajv
  if (!options.skipMetaValidation) {
    const ajv = new AjvConstructor({
      allErrors: true,
      strict: false,
      validateSchema: true,
    });
    addFormatsFunc(ajv);

    const valid = ajv.validateSchema(schema);

    if (!valid && ajv.errors) {
      for (const err of ajv.errors) {
        errors.push({
          path: err.instancePath || '/',
          message: `${err.keyword}: ${err.message}`,
          rule: `meta:${err.keyword}`,
          severity: 'error',
        });
      }
    }
  }

  // Phase 2: Style rules
  if (!options.skipStyleRules) {
    const styleIssues = runLintRules(schema, options.enabledRules, options.disabledRules);

    // Partition into errors and warnings
    for (const issue of styleIssues) {
      if (issue.severity === 'error') {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }
  }

  // Additional meta-level warnings

  // Warn about unknown $schema versions
  if (schema.$schema && typeof schema.$schema === 'string') {
    const schemaUri = schema.$schema;
    let isKnown = false;
    try {
      const uri = new URL(schemaUri);
      const paths = [
        '/draft-04/schema',
        '/draft-06/schema',
        '/draft-07/schema',
        '/draft/2019-09/schema',
        '/draft/2020-12/schema',
      ];
      isKnown =
        ['http:', 'https:'].includes(uri.protocol) &&
        uri.hostname === 'json-schema.org' &&
        paths.includes(uri.pathname);
    } catch {
      // Malformed identifiers are unrecognized drafts.
    }

    if (!isKnown) {
      warnings.push({
        path: '/$schema',
        message: `Unknown schema draft: ${schemaUri}. Validation may be incomplete.`,
        rule: 'unknown-draft',
        severity: 'warning',
      });
    }
  }

  return {
    contract: '',
    specPath,
    errors,
    warnings,
  };
}

/**
 * Lint a JSON Schema object directly (no file I/O)
 *
 * @param schema - JSON Schema object
 * @param options - Linting options
 * @returns Lint result with errors and warnings
 */
export async function lintJsonSchemaObject(
  schema: SchemaNode,
  options: JsonSchemaLintOptions = {}
): Promise<LintResult> {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];

  // Phase 1: Meta-validation using ajv
  if (!options.skipMetaValidation) {
    const ajv = new AjvConstructor({
      allErrors: true,
      strict: false,
      validateSchema: true,
    });
    addFormatsFunc(ajv);

    const valid = ajv.validateSchema(schema);

    if (!valid && ajv.errors) {
      for (const err of ajv.errors) {
        errors.push({
          path: err.instancePath || '/',
          message: `${err.keyword}: ${err.message}`,
          rule: `meta:${err.keyword}`,
          severity: 'error',
        });
      }
    }
  }

  // Phase 2: Style rules
  if (!options.skipStyleRules) {
    const styleIssues = runLintRules(schema, options.enabledRules, options.disabledRules);

    for (const issue of styleIssues) {
      if (issue.severity === 'error') {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }
  }

  return {
    contract: '',
    specPath: '',
    errors,
    warnings,
  };
}

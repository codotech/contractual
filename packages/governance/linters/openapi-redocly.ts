/**
 * OpenAPI Linter using @redocly/openapi-core
 *
 * Wraps Redocly's OpenAPI linting library to validate OpenAPI specs.
 * Users can place a .redocly.yaml in their repo for custom rules.
 */

import type { LintResult, LintIssue } from '@contractual/types';

/**
 * Lint an OpenAPI specification using Redocly
 *
 * @param specPath - Path to the OpenAPI spec file
 * @returns Lint result with errors and warnings
 */
export async function lintOpenAPI(specPath: string): Promise<LintResult> {
  // Dynamic import to handle the library being optional
  let lint: typeof import('@redocly/openapi-core').lint;
  let loadConfig: typeof import('@redocly/openapi-core').loadConfig;

  try {
    const redocly = await import('@redocly/openapi-core');
    lint = redocly.lint;
    loadConfig = redocly.loadConfig;
  } catch {
    throw new Error(
      'OpenAPI linting requires @redocly/openapi-core. ' +
        'Install it with: npm install @redocly/openapi-core'
    );
  }

  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];

  try {
    // Load config from .redocly.yaml if present, or use defaults
    const config = await loadConfig();

    // Run the linter
    const results = await lint({
      ref: specPath,
      config,
    });

    // Process problems
    for (const problem of results) {
      const issue: LintIssue = {
        path: problem.location?.[0]?.pointer ?? '',
        message: problem.message,
        rule: problem.ruleId,
        severity: problem.severity === 'error' ? 'error' : 'warning',
      };

      if (issue.severity === 'error') {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }
  } catch (error: unknown) {
    // Handle parse errors or file not found
    const message = error instanceof Error ? error.message : 'Unknown error during linting';

    errors.push({
      path: '/',
      message,
      rule: 'parse-error',
      severity: 'error',
    });
  }

  return {
    contract: '', // Filled by caller
    specPath,
    errors,
    warnings,
  };
}

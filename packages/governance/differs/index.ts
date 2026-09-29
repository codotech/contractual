/**
 * Differs
 *
 * Contract differ implementations for detecting structural changes
 * between two versions of a contract specification.
 *
 * All differs are pure Node.js - no binary dependencies.
 */

export { diffOpenApi, diffOpenApiObjects, resolveOpenApiSpec } from '@contractual/differs.openapi';

export { diffJsonSchema } from './json-schema/index.js';

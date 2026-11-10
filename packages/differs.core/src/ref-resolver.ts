/**
 * JSON Schema $ref Resolver
 *
 * Resolves all $ref pointers in a JSON Schema, producing a self-contained schema.
 * Handles internal references ($defs, definitions) and detects circular references.
 *
 * This resolver operates on in-memory schema objects and does not fetch external URLs.
 * External references are flagged as warnings.
 */

/**
 * Result of resolving references in a schema
 */
export interface ResolveResult {
  /** The resolved schema with $refs replaced */
  readonly schema: unknown;
  /** Warnings encountered during resolution (circular refs, external refs, etc.) */
  readonly warnings: string[];
}

/**
 * Internal context for tracking resolution state
 */
interface ResolveContext {
  /** The root schema for resolving internal references */
  readonly root: unknown;
  /** Accumulated warnings */
  readonly warnings: string[];
  /** Set of $ref paths currently being resolved (for circular detection) */
  readonly resolving: Set<string>;
  /** Cache of already resolved $refs to their values */
  readonly cache: Map<string, unknown>;
  /** Current JSON Pointer path (for error messages) */
  currentPath: string;
}

/**
 * Resolve all $ref pointers in a JSON Schema
 *
 * Creates a self-contained schema by inlining all internal references.
 * Does not modify the original schema.
 *
 * @param schema - The JSON Schema to resolve
 * @returns The resolved schema and any warnings
 *
 * @example
 * ```typescript
 * const schema = {
 *   type: 'object',
 *   properties: {
 *     user: { $ref: '#/$defs/User' }
 *   },
 *   $defs: {
 *     User: { type: 'object', properties: { name: { type: 'string' } } }
 *   }
 * };
 *
 * const result = resolveRefs(schema);
 * // result.schema.properties.user === { type: 'object', properties: { name: { type: 'string' } } }
 * // result.warnings === []
 * ```
 */
export function resolveRefs(schema: unknown): ResolveResult {
  const context = {
    root: schema,
    warnings: [],
    resolving: new Set(),
    cache: new Map(),
    currentPath: '',
  } satisfies ResolveContext;

  const resolved = resolveNode(schema, context);

  return {
    schema: resolved,
    warnings: context.warnings,
  };
}

/**
 * Recursively resolve a schema node
 */
function resolveNode(node: unknown, context: ResolveContext): unknown {
  // Handle non-objects
  if (!isObject(node)) {
    return node;
  }

  const obj = node as Record<string, unknown>;

  // Check if this is a $ref node
  if (typeof obj['$ref'] === 'string') {
    return resolveRef(obj['$ref'], obj, context);
  }

  // Recursively resolve all properties
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const previousPath = context.currentPath;
    context.currentPath = `${context.currentPath}/${encodeJsonPointerSegment(key)}`;

    if (Array.isArray(value)) {
      resolved[key] = value.map((item, index) => {
        const itemPath = context.currentPath;
        context.currentPath = `${itemPath}/${index}`;
        const resolvedItem = resolveNode(item, context);
        context.currentPath = itemPath;
        return resolvedItem;
      });
    } else {
      resolved[key] = resolveNode(value, context);
    }

    context.currentPath = previousPath;
  }

  return resolved;
}

/**
 * Resolve a $ref pointer
 */
function resolveRef(
  ref: string,
  refNode: Record<string, unknown>,
  context: ResolveContext
): unknown {
  // Check for external references
  if (isExternalRef(ref)) {
    context.warnings.push(
      `External reference not resolved: ${ref} at ${context.currentPath || '/'}`
    );
    // Return the $ref node as-is for external refs
    return refNode;
  }

  // Check for circular reference
  if (context.resolving.has(ref)) {
    context.warnings.push(`Circular reference detected: ${ref} at ${context.currentPath || '/'}`);
    // Return a placeholder to break the cycle
    return {
      $circularRef: ref,
      $comment: 'Circular reference - see original location',
    };
  }

  // Check cache
  if (context.cache.has(ref)) {
    return context.cache.get(ref);
  }

  // Mark as currently resolving
  context.resolving.add(ref);

  try {
    // Resolve the reference
    const target = resolvePointer(ref, context.root);

    if (target === undefined) {
      context.warnings.push(`Reference not found: ${ref} at ${context.currentPath || '/'}`);
      // Return the $ref node as-is if target not found
      return refNode;
    }

    // Recursively resolve the target (it may contain more $refs)
    const resolved = resolveNode(target, context);

    // Merge any sibling properties from the $ref node
    // JSON Schema allows properties alongside $ref in draft 2019-09+
    const siblings = extractSiblingProperties(refNode);
    const merged = mergeSiblings(resolved, siblings);

    // Cache the result
    context.cache.set(ref, merged);

    return merged;
  } finally {
    // Remove from resolving set
    context.resolving.delete(ref);
  }
}

/**
 * Check if a reference is external (http://, https://, file://)
 */
function isExternalRef(ref: string): boolean {
  return (
    ref.startsWith('http://') ||
    ref.startsWith('https://') ||
    ref.startsWith('file://') ||
    // Relative file references (not starting with #)
    (!ref.startsWith('#') &&
      (ref.endsWith('.json') || ref.endsWith('.yaml') || ref.endsWith('.yml')))
  );
}

/**
 * Resolve a JSON Pointer within a document
 *
 * Supports:
 * - #/$defs/Name
 * - #/definitions/Name
 * - #/properties/field/items
 *
 * @param pointer - The JSON Pointer (e.g., '#/$defs/User')
 * @param root - The root document
 * @returns The resolved value or undefined if not found
 */
function resolvePointer(pointer: string, root: unknown): unknown {
  // Handle empty or root pointer
  if (pointer === '#' || pointer === '') {
    return root;
  }

  // Remove the leading # if present
  let path = pointer;
  if (path.startsWith('#')) {
    path = path.slice(1);
  }

  // Remove leading slash
  if (path.startsWith('/')) {
    path = path.slice(1);
  }

  // Handle empty path after normalization
  if (!path) {
    return root;
  }

  // Split into segments and navigate
  const segments = path.split('/');
  let current: unknown = root;

  for (const segment of segments) {
    if (!isObject(current) && !Array.isArray(current)) {
      return undefined;
    }

    const decoded = decodeJsonPointerSegment(segment);

    if (Array.isArray(current)) {
      const index = parseInt(decoded, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
    } else {
      const obj = current as Record<string, unknown>;
      if (!(decoded in obj)) {
        return undefined;
      }
      current = obj[decoded];
    }
  }

  return current;
}

/**
 * Decode a JSON Pointer segment (RFC 6901)
 *
 * ~0 -> ~
 * ~1 -> /
 */
function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Encode a JSON Pointer segment (RFC 6901)
 *
 * ~ -> ~0
 * / -> ~1
 */
function encodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Extract sibling properties from a $ref node
 *
 * In JSON Schema draft 2019-09+, properties alongside $ref are allowed
 * and should be merged with the referenced schema.
 */
function extractSiblingProperties(refNode: Record<string, unknown>): Record<string, unknown> {
  const siblings: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(refNode)) {
    if (key !== '$ref') {
      siblings[key] = value;
    }
  }

  return siblings;
}

/**
 * Merge sibling properties with a resolved schema
 */
function mergeSiblings(resolved: unknown, siblings: Record<string, unknown>): unknown {
  // If no siblings, return as-is
  if (Object.keys(siblings).length === 0) {
    return resolved;
  }

  // If resolved is not an object, wrap in allOf
  if (!isObject(resolved)) {
    return {
      allOf: [resolved, siblings],
    };
  }

  // Merge properties, siblings override resolved
  return {
    ...(resolved as Record<string, unknown>),
    ...siblings,
  };
}

/**
 * Type guard for objects
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if a schema contains any unresolved $refs
 *
 * @param schema - The schema to check
 * @returns True if the schema contains $ref pointers
 */
export function hasUnresolvedRefs(schema: unknown): boolean {
  if (!isObject(schema)) {
    return false;
  }

  const obj = schema as Record<string, unknown>;

  // Check if this node is a $ref
  if (typeof obj['$ref'] === 'string' && !obj['$circularRef']) {
    return true;
  }

  // Check children
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (hasUnresolvedRefs(item)) {
          return true;
        }
      }
    } else if (hasUnresolvedRefs(value)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract all $ref pointers from a schema
 *
 * @param schema - The schema to analyze
 * @returns Array of { pointer, path } objects
 */
export function extractRefs(schema: unknown): Array<{ pointer: string; path: string }> {
  const refs: Array<{ pointer: string; path: string }> = [];
  collectRefs(schema, '', refs);
  return refs;
}

/**
 * Recursively collect $refs
 */
function collectRefs(
  node: unknown,
  path: string,
  refs: Array<{ pointer: string; path: string }>
): void {
  if (!isObject(node)) {
    return;
  }

  const obj = node as Record<string, unknown>;

  if (typeof obj['$ref'] === 'string') {
    refs.push({ pointer: obj['$ref'], path: path || '/' });
  }

  for (const [key, value] of Object.entries(obj)) {
    const childPath = `${path}/${encodeJsonPointerSegment(key)}`;

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        collectRefs(item, `${childPath}/${index}`, refs);
      });
    } else {
      collectRefs(value, childPath, refs);
    }
  }
}

/**
 * Validate that all internal references in a schema are resolvable
 *
 * @param schema - The schema to validate
 * @returns Object with valid flag and any error messages
 */
export function validateRefs(schema: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const refs = extractRefs(schema);

  for (const { pointer, path } of refs) {
    // Skip external refs for this validation
    if (isExternalRef(pointer)) {
      continue;
    }

    const resolved = resolvePointer(pointer, schema);
    if (resolved === undefined) {
      errors.push(`Invalid reference at ${path}: ${pointer} not found`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

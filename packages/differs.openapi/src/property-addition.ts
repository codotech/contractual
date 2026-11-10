import type { ChangeSeverity, RawChange } from '@contractual/types';
import { deepEqual, isSchemaObject } from '@contractual/differs.core';

// These are annotations under the existing differ policy, including format.
const ANNOTATIONS = new Set([
  'title',
  'description',
  'default',
  'examples',
  '$comment',
  'deprecated',
  'readOnly',
  'writeOnly',
  'format',
  'contentEncoding',
  'contentMediaType',
  'contentSchema',
]);

// Independent assertions can be retained alongside extra constraints. Object
// applicators such as additionalProperties cannot: properties changes their scope.
const INDEPENDENT_ASSERTIONS = new Set([
  'type',
  'enum',
  'const',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'required',
]);

const UNSUPPORTED_PARENT_KEYS = [
  '$ref',
  'propertyNames',
  'dependentSchemas',
  'dependentRequired',
  'dependencies',
  'unevaluatedProperties',
  'unevaluatedItems',
];

/**
 * Prove compatibility for named property additions using their actual parents.
 * Unproved schema implications are conservative breaking findings, not an
 * assertion that this implements general JSON Schema subsumption.
 */
export function classifyPropertyAddition(
  change: RawChange,
  oldUsesNullable: boolean,
  newUsesNullable: boolean
): ChangeSeverity {
  const context = change.propertyAddition;
  if (!context || !change.schemaDirection) return 'breaking';
  // Equal nested schemas need not have equal semantics across dialect changes.
  if (oldUsesNullable !== newUsesNullable) return 'breaking';
  const { name, oldParent, newParent } = context;
  if (
    context.uncertain ||
    UNSUPPORTED_PARENT_KEYS.some(
      (key) => Object.hasOwn(oldParent, key) || Object.hasOwn(newParent, key)
    )
  )
    return 'breaking';

  const oldRequired = Array.isArray(oldParent.required) && oldParent.required.includes(name);
  const newRequired = Array.isArray(newParent.required) && newParent.required.includes(name);
  if (change.schemaDirection === 'input' && newRequired && !oldRequired) return 'breaking';

  const oldConstraints = matchingPatterns(oldParent.patternProperties, name);
  const newConstraints = matchingPatterns(newParent.patternProperties, name);
  if (!oldConstraints || !newConstraints) return 'breaking';
  // patternProperties always applies to matching names, even when the property
  // also appears in properties. additionalProperties applies only otherwise.
  if (oldConstraints.length === 0) oldConstraints.push(oldParent.additionalProperties ?? true);
  newConstraints.push(change.newValue);

  const compatible =
    change.schemaDirection === 'input'
      ? implies(oldConstraints, newConstraints, oldUsesNullable)
      : implies(newConstraints, oldConstraints, oldUsesNullable);
  return compatible ? 'non-breaking' : 'breaking';
}

function matchingPatterns(patterns: unknown, name: string): unknown[] | null {
  if (patterns === undefined) return [];
  if (!isSchemaObject(patterns)) return null;
  try {
    return Object.entries(patterns)
      .filter(([pattern]) => new RegExp(pattern, 'u').test(name))
      .map(([, schema]) => schema);
  } catch {
    return null;
  }
}

function assertions(schema: unknown, usesNullable: boolean): unknown {
  if (!isSchemaObject(schema)) return schema;
  const result = Object.fromEntries(
    Object.entries(schema).filter(([key]) => !ANNOTATIONS.has(key) && key !== 'nullable')
  );
  // OpenAPI 3.0 adds null only to an explicit, local type. Other assertions,
  // including enum, still apply. In 3.1 nullable is not a validation keyword.
  if (usesNullable && schema.nullable === true && typeof schema.type === 'string') {
    result.type = [schema.type, 'null'];
  }
  return result;
}

function unconstrained(schema: unknown): boolean {
  return schema === true || (isSchemaObject(schema) && Object.keys(schema).length === 0);
}

/** A bounded proof over conjunctions; unsupported implications remain unproved. */
function implies(source: unknown[], target: unknown[], usesNullable: boolean): boolean {
  const from = source.map((schema) => assertions(schema, usesNullable));
  const to = target.map((schema) => assertions(schema, usesNullable));
  if (from.includes(false)) return true;
  return to.every((constraint) => {
    if (unconstrained(constraint)) return true;
    if (!isSchemaObject(constraint)) return from.some((item) => deepEqual(item, constraint));
    if (containsReference(constraint) || from.some((item) => containsReference(item))) return false;
    if (from.some((item) => deepEqual(item, constraint))) return true;
    // Each independent target assertion must follow from a source constraint.
    // Matching patterns can contribute different assertions; types allow subsets.
    return Object.entries(constraint).every(
      ([key, value]) =>
        INDEPENDENT_ASSERTIONS.has(key) &&
        from.some(
          (item) =>
            isSchemaObject(item) &&
            Object.hasOwn(item, key) &&
            (key === 'type' ? typeImplies(item[key], value) : deepEqual(item[key], value))
        )
    );
  });
}

function typeImplies(source: unknown, target: unknown): boolean {
  const from = Array.isArray(source) ? source : [source];
  const to = Array.isArray(target) ? target : [target];
  return from.every((type) => to.includes(type) || (type === 'integer' && to.includes('number')));
}

// Equal unresolved references can denote different schemas in old/new documents.
function containsReference(value: unknown, seen = new Set<unknown>()): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (seen.has(value)) return true;
  seen.add(value);
  const found = Object.entries(value).some(
    ([key, child]) => key === '$ref' || key === '$dynamicRef' || containsReference(child, seen)
  );
  seen.delete(value);
  return found;
}

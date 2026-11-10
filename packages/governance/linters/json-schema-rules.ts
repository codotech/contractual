/**
 * JSON Schema Linting Rules
 *
 * Native TypeScript implementation of linting rules for JSON Schema.
 * Based on best practices from Sourcemeta, JSON Schema org, and community discussions.
 *
 * @see https://github.com/sourcemeta/jsonschema
 * @see https://github.com/orgs/json-schema-org/discussions/323
 */

import type { LintIssue, LintSeverity } from '@contractual/types';
import { type ResolvedSchema, isSchemaObject } from '@contractual/differs.json-schema';

// Re-export ResolvedSchema as SchemaNode for linting API
export type { ResolvedSchema as SchemaNode } from '@contractual/differs.json-schema';

/**
 * Lint rule definition
 */
export interface LintRule {
  /** Rule identifier */
  id: string;
  /** Human-readable description */
  description: string;
  /** Default severity */
  severity: LintSeverity;
  /** Check function - returns issues found at this schema node */
  check: (schema: ResolvedSchema, path: string, root: ResolvedSchema) => LintIssue[];
}

/**
 * Keywords that only apply to specific types
 */
const TYPE_SPECIFIC_KEYWORDS: Record<string, string[]> = {
  string: ['minLength', 'maxLength', 'pattern', 'format'],
  number: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'],
  integer: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'],
  array: [
    'items',
    'additionalItems',
    'prefixItems',
    'contains',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minContains',
    'maxContains',
  ],
  object: [
    'properties',
    'additionalProperties',
    'required',
    'minProperties',
    'maxProperties',
    'patternProperties',
    'propertyNames',
  ],
  boolean: [],
  null: [],
};

/**
 * Known JSON Schema format values
 */
const KNOWN_FORMATS = new Set([
  // Dates and times (RFC 3339)
  'date-time',
  'date',
  'time',
  'duration',
  // Email (RFC 5321/5322)
  'email',
  'idn-email',
  // Hostnames (RFC 1123/5891)
  'hostname',
  'idn-hostname',
  // IP addresses (RFC 2673/4291)
  'ipv4',
  'ipv6',
  // URIs (RFC 3986/3987)
  'uri',
  'uri-reference',
  'iri',
  'iri-reference',
  'uri-template',
  // JSON Pointer (RFC 6901)
  'json-pointer',
  'relative-json-pointer',
  // Regex (ECMA 262)
  'regex',
  // UUID (RFC 4122)
  'uuid',
]);

/**
 * All built-in linting rules
 */
export const LINT_RULES: LintRule[] = [
  // ==========================================
  // Schema Declaration Rules
  // ==========================================
  {
    id: 'missing-schema',
    description: 'Root schema should declare $schema',
    severity: 'warning',
    check: (schema, path, root) => {
      // Only check at root
      if (path !== '/' || schema !== root) return [];
      if (!schema.$schema) {
        return [
          {
            path: '/',
            message:
              'No $schema declared. Consider adding "$schema": "https://json-schema.org/draft/2020-12/schema"',
            rule: 'missing-schema',
            severity: 'warning',
          },
        ];
      }
      return [];
    },
  },

  {
    id: 'schema-not-at-root',
    description: '$schema should only appear at resource root (with $id) or document root',
    severity: 'warning',
    check: (schema, path, root) => {
      if (path === '/' || schema === root) return [];
      if (schema.$schema && !schema.$id) {
        return [
          {
            path,
            message:
              '$schema without $id in non-root location. $schema should only appear at resource roots.',
            rule: 'schema-not-at-root',
            severity: 'warning',
          },
        ];
      }
      return [];
    },
  },

  // ==========================================
  // Metadata Rules
  // ==========================================
  {
    id: 'missing-title',
    description: 'Root schema should have a title',
    severity: 'warning',
    check: (schema, path, root) => {
      if (path !== '/' || schema !== root) return [];
      if (!schema.title) {
        return [
          {
            path: '/',
            message: 'Root schema has no title. Consider adding one for documentation.',
            rule: 'missing-title',
            severity: 'warning',
          },
        ];
      }
      return [];
    },
  },

  {
    id: 'missing-description',
    description: 'Root schema should have a description',
    severity: 'warning',
    check: (schema, path, root) => {
      if (path !== '/' || schema !== root) return [];
      if (!schema.description) {
        return [
          {
            path: '/',
            message: 'Root schema has no description. Consider adding one for documentation.',
            rule: 'missing-description',
            severity: 'warning',
          },
        ];
      }
      return [];
    },
  },

  // ==========================================
  // Enum/Const Rules
  // ==========================================
  {
    id: 'enum-to-const',
    description: 'An enum with a single value should use const instead',
    severity: 'warning',
    check: (schema, path) => {
      if (schema.enum && Array.isArray(schema.enum) && schema.enum.length === 1) {
        return [
          {
            path,
            message: `An 'enum' with a single value can be expressed as 'const'. Use: "const": ${JSON.stringify(schema.enum[0])}`,
            rule: 'enum-to-const',
            severity: 'warning',
          },
        ];
      }
      return [];
    },
  },

  {
    id: 'enum-with-type',
    description: 'Using type with enum is redundant when enum values are all the same type',
    severity: 'warning',
    check: (schema, path) => {
      if (!schema.enum || !schema.type) return [];

      const enumValues = schema.enum;
      if (!Array.isArray(enumValues) || enumValues.length === 0) return [];

      // Determine types of all enum values
      const enumTypes = new Set(
        enumValues.map((v) => {
          if (v === null) return 'null';
          if (Array.isArray(v)) return 'array';
          return typeof v;
        })
      );

      // Map JS types to JSON Schema types
      const jsToSchema: Record<string, string> = {
        string: 'string',
        number: 'number',
        boolean: 'boolean',
        object: 'object',
        null: 'null',
        array: 'array',
      };

      const schemaTypes = new Set([...enumTypes].map((t) => jsToSchema[t] || t));
      const declaredType = new Set<string>(
        Array.isArray(schema.type) ? schema.type : [schema.type as string]
      );

      // Check if type declaration matches enum value types exactly
      const typesMatch =
        schemaTypes.size === declaredType.size &&
        [...schemaTypes].every((t) => declaredType.has(t));

      if (typesMatch) {
        return [
          {
            path,
            message: "'type' is redundant when 'enum' values already constrain the type",
            rule: 'enum-with-type',
            severity: 'warning',
          },
        ];
      }
      return [];
    },
  },

  {
    id: 'const-with-type',
    description: 'Using type with const is redundant when const value determines the type',
    severity: 'warning',
    check: (schema, path) => {
      if (schema.const === undefined || !schema.type) return [];

      const constValue = schema.const;
      let constType: string;

      if (constValue === null) {
        constType = 'null';
      } else if (Array.isArray(constValue)) {
        constType = 'array';
      } else {
        constType = typeof constValue;
      }

      // Map JS type to JSON Schema type
      const jsToSchema: Record<string, string> = {
        string: 'string',
        number: 'number',
        boolean: 'boolean',
        object: 'object',
        null: 'null',
        array: 'array',
      };
      const schemaConstType = jsToSchema[constType] || constType;

      const declaredType = Array.isArray(schema.type) ? schema.type : [schema.type];

      if (declaredType.length === 1 && declaredType[0] === schemaConstType) {
        return [
          {
            path,
            message: "'type' is redundant when 'const' value already determines the type",
            rule: 'const-with-type',
            severity: 'warning',
          },
        ];
      }
      return [];
    },
  },

  // ==========================================
  // Conditional Schema Rules
  // ==========================================
  {
    id: 'if-without-then-else',
    description: 'if without then or else is unnecessary',
    severity: 'warning',
    check: (schema, path) => {
      if (schema.if && !schema.then && !schema.else) {
        return [
          {
            path,
            message: "'if' without 'then' or 'else' has no effect and can be removed",
            rule: 'if-without-then-else',
            severity: 'warning',
          },
        ];
      }
      return [];
    },
  },

  {
    id: 'then-else-without-if',
    description: 'then or else without if is unnecessary',
    severity: 'warning',
    check: (schema, path) => {
      const issues: LintIssue[] = [];
      if (schema.then && !schema.if) {
        issues.push({
          path,
          message: "'then' without 'if' has no effect and can be removed",
          rule: 'then-else-without-if',
          severity: 'warning',
        });
      }
      if (schema.else && !schema.if) {
        issues.push({
          path,
          message: "'else' without 'if' has no effect and can be removed",
          rule: 'then-else-without-if',
          severity: 'warning',
        });
      }
      return issues;
    },
  },

  // ==========================================
  // Array Constraint Rules
  // ==========================================
  {
    id: 'additional-items-redundant',
    description: 'additionalItems is ignored when items is a schema (not tuple)',
    severity: 'warning',
    check: (schema, path) => {
      // additionalItems only matters when items is an array (tuple validation)
      // When items is a schema, additionalItems is ignored
      if (schema.additionalItems !== undefined && schema.items && !Array.isArray(schema.items)) {
        return [
          {
            path,
            message:
              "'additionalItems' is ignored when 'items' is a schema (not a tuple). Remove 'additionalItems' or use tuple validation.",
            rule: 'additional-items-redundant',
            severity: 'warning',
          },
        ];
      }
      return [];
    },
  },

  {
    id: 'contains-required',
    description: 'minContains or maxContains without contains is unnecessary',
    severity: 'warning',
    check: (schema, path) => {
      const issues: LintIssue[] = [];
      if (schema.minContains !== undefined && !schema.contains) {
        issues.push({
          path,
          message: "'minContains' without 'contains' has no effect",
          rule: 'contains-required',
          severity: 'warning',
        });
      }
      if (schema.maxContains !== undefined && !schema.contains) {
        issues.push({
          path,
          message: "'maxContains' without 'contains' has no effect",
          rule: 'contains-required',
          severity: 'warning',
        });
      }
      return issues;
    },
  },

  // ==========================================
  // Type Compatibility Rules
  // ==========================================
  {
    id: 'type-incompatible-keywords',
    description: 'Validation keywords that do not apply to the declared type',
    severity: 'warning',
    check: (schema, path) => {
      if (!schema.type || Array.isArray(schema.type)) return [];

      const declaredType = schema.type as string;
      const applicableKeywords = TYPE_SPECIFIC_KEYWORDS[declaredType] || [];
      const issues: LintIssue[] = [];

      // Check for keywords that apply to other types
      for (const [type, keywords] of Object.entries(TYPE_SPECIFIC_KEYWORDS)) {
        if (type === declaredType) continue;

        for (const keyword of keywords) {
          if (schema[keyword] !== undefined && !applicableKeywords.includes(keyword)) {
            issues.push({
              path,
              message: `'${keyword}' applies to type '${type}' but schema declares type '${declaredType}'`,
              rule: 'type-incompatible-keywords',
              severity: 'warning',
            });
          }
        }
      }

      return issues;
    },
  },

  // ==========================================
  // Range Validation Rules
  // ==========================================
  {
    id: 'invalid-numeric-range',
    description: 'maximum should be greater than or equal to minimum',
    severity: 'error',
    check: (schema, path) => {
      const issues: LintIssue[] = [];

      if (typeof schema.minimum === 'number' && typeof schema.maximum === 'number') {
        if (schema.maximum < schema.minimum) {
          issues.push({
            path,
            message: `'maximum' (${schema.maximum}) is less than 'minimum' (${schema.minimum})`,
            rule: 'invalid-numeric-range',
            severity: 'error',
          });
        }
      }

      // Handle exclusive bounds (draft-06+ where they are numbers)
      if (
        typeof schema.exclusiveMinimum === 'number' &&
        typeof schema.exclusiveMaximum === 'number'
      ) {
        if (schema.exclusiveMaximum <= schema.exclusiveMinimum) {
          issues.push({
            path,
            message: `'exclusiveMaximum' (${schema.exclusiveMaximum}) is not greater than 'exclusiveMinimum' (${schema.exclusiveMinimum})`,
            rule: 'invalid-numeric-range',
            severity: 'error',
          });
        }
      }

      return issues;
    },
  },

  {
    id: 'invalid-length-range',
    description: 'maxLength should be greater than or equal to minLength',
    severity: 'error',
    check: (schema, path) => {
      if (typeof schema.minLength === 'number' && typeof schema.maxLength === 'number') {
        if (schema.maxLength < schema.minLength) {
          return [
            {
              path,
              message: `'maxLength' (${schema.maxLength}) is less than 'minLength' (${schema.minLength})`,
              rule: 'invalid-length-range',
              severity: 'error',
            },
          ];
        }
      }
      return [];
    },
  },

  {
    id: 'invalid-items-range',
    description: 'maxItems should be greater than or equal to minItems',
    severity: 'error',
    check: (schema, path) => {
      if (typeof schema.minItems === 'number' && typeof schema.maxItems === 'number') {
        if (schema.maxItems < schema.minItems) {
          return [
            {
              path,
              message: `'maxItems' (${schema.maxItems}) is less than 'minItems' (${schema.minItems})`,
              rule: 'invalid-items-range',
              severity: 'error',
            },
          ];
        }
      }
      return [];
    },
  },

  {
    id: 'invalid-properties-range',
    description: 'maxProperties should be greater than or equal to minProperties',
    severity: 'error',
    check: (schema, path) => {
      if (typeof schema.minProperties === 'number' && typeof schema.maxProperties === 'number') {
        if (schema.maxProperties < schema.minProperties) {
          return [
            {
              path,
              message: `'maxProperties' (${schema.maxProperties}) is less than 'minProperties' (${schema.minProperties})`,
              rule: 'invalid-properties-range',
              severity: 'error',
            },
          ];
        }
      }
      return [];
    },
  },

  // ==========================================
  // Format Rules
  // ==========================================
  {
    id: 'unknown-format',
    description: 'Unknown format value may not be validated',
    severity: 'warning',
    check: (schema, path) => {
      if (typeof schema.format === 'string' && !KNOWN_FORMATS.has(schema.format)) {
        return [
          {
            path,
            message: `Unknown format '${schema.format}'. Custom formats may not be validated by all implementations.`,
            rule: 'unknown-format',
            severity: 'warning',
          },
        ];
      }
      return [];
    },
  },

  // ==========================================
  // Empty Schema Rules
  // ==========================================
  {
    id: 'empty-enum',
    description: 'Empty enum matches nothing and is likely an error',
    severity: 'error',
    check: (schema, path) => {
      if (schema.enum && Array.isArray(schema.enum) && schema.enum.length === 0) {
        return [
          {
            path,
            message: "Empty 'enum' array will never validate any value",
            rule: 'empty-enum',
            severity: 'error',
          },
        ];
      }
      return [];
    },
  },

  {
    id: 'empty-required',
    description: 'Empty required array is unnecessary',
    severity: 'warning',
    check: (schema, path) => {
      if (schema.required && Array.isArray(schema.required) && schema.required.length === 0) {
        return [
          {
            path,
            message: "Empty 'required' array can be removed",
            rule: 'empty-required',
            severity: 'warning',
          },
        ];
      }
      return [];
    },
  },

  {
    id: 'empty-allof-anyof-oneof',
    description: 'Empty allOf/anyOf/oneOf is likely an error',
    severity: 'error',
    check: (schema, path) => {
      const issues: LintIssue[] = [];
      for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
        const value = schema[keyword];
        if (value && Array.isArray(value) && value.length === 0) {
          issues.push({
            path,
            message: `Empty '${keyword}' array ${keyword === 'anyOf' || keyword === 'oneOf' ? 'will never validate' : 'is redundant'}`,
            rule: 'empty-allof-anyof-oneof',
            severity: keyword === 'allOf' ? 'warning' : 'error',
          });
        }
      }
      return issues;
    },
  },

  // ==========================================
  // Required Properties Rules
  // ==========================================
  {
    id: 'required-undefined-property',
    description: 'Required property is not defined in properties',
    severity: 'warning',
    check: (schema, path) => {
      if (!schema.required || !schema.properties) return [];

      const issues: LintIssue[] = [];
      const definedProps = new Set(Object.keys(schema.properties));

      for (const requiredProp of schema.required) {
        if (!definedProps.has(requiredProp)) {
          issues.push({
            path,
            message: `Required property '${requiredProp}' is not defined in 'properties'`,
            rule: 'required-undefined-property',
            severity: 'warning',
          });
        }
      }
      return issues;
    },
  },

  {
    id: 'duplicate-required',
    description: 'Duplicate entries in required array',
    severity: 'warning',
    check: (schema, path) => {
      if (!schema.required || !Array.isArray(schema.required)) return [];

      const seen = new Set<string>();
      const duplicates = new Set<string>();

      for (const prop of schema.required) {
        if (seen.has(prop)) {
          duplicates.add(prop);
        }
        seen.add(prop);
      }

      if (duplicates.size > 0) {
        return [
          {
            path,
            message: `Duplicate entries in 'required': ${[...duplicates].join(', ')}`,
            rule: 'duplicate-required',
            severity: 'warning',
          },
        ];
      }
      return [];
    },
  },
];

/**
 * Run all lint rules against a schema, recursively walking all subschemas
 */
export function runLintRules(
  schema: ResolvedSchema,
  enabledRules?: Set<string>,
  disabledRules?: Set<string>
): LintIssue[] {
  const issues: LintIssue[] = [];
  const activeRules = LINT_RULES.filter((rule) => {
    if (disabledRules?.has(rule.id)) return false;
    if (enabledRules && !enabledRules.has(rule.id)) return false;
    return true;
  });

  walkSchema(schema, '/', schema, (node, path, root) => {
    for (const rule of activeRules) {
      const ruleIssues = rule.check(node, path, root);
      issues.push(...ruleIssues);
    }
  });

  return issues;
}

/**
 * Walk all subschemas in a JSON Schema document
 */
function walkSchema(
  schema: ResolvedSchema,
  path: string,
  root: ResolvedSchema,
  visitor: (node: ResolvedSchema, path: string, root: ResolvedSchema) => void
): void {
  if (!isSchemaObject(schema)) return;

  visitor(schema, path, root);

  // Properties
  if (schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      if (isSchemaObject(value)) {
        walkSchema(value, `${path}/properties/${key}`, root, visitor);
      }
    }
  }

  // Additional properties
  if (isSchemaObject(schema.additionalProperties)) {
    walkSchema(schema.additionalProperties, `${path}/additionalProperties`, root, visitor);
  }

  // Pattern properties
  if (schema.patternProperties) {
    for (const [pattern, value] of Object.entries(schema.patternProperties)) {
      if (isSchemaObject(value)) {
        walkSchema(
          value,
          `${path}/patternProperties/${encodeURIComponent(pattern)}`,
          root,
          visitor
        );
      }
    }
  }

  // Property names
  if (isSchemaObject(schema.propertyNames)) {
    walkSchema(schema.propertyNames, `${path}/propertyNames`, root, visitor);
  }

  // Items (array or single schema)
  if (schema.items) {
    if (Array.isArray(schema.items)) {
      schema.items.forEach((item, i) => {
        if (isSchemaObject(item)) {
          walkSchema(item, `${path}/items/${i}`, root, visitor);
        }
      });
    } else if (isSchemaObject(schema.items)) {
      walkSchema(schema.items, `${path}/items`, root, visitor);
    }
  }

  // Prefix items (2020-12)
  if (schema.prefixItems && Array.isArray(schema.prefixItems)) {
    schema.prefixItems.forEach((item, i) => {
      if (isSchemaObject(item)) {
        walkSchema(item, `${path}/prefixItems/${i}`, root, visitor);
      }
    });
  }

  // Contains
  if (isSchemaObject(schema.contains)) {
    walkSchema(schema.contains, `${path}/contains`, root, visitor);
  }

  // Conditional
  if (isSchemaObject(schema.if)) {
    walkSchema(schema.if, `${path}/if`, root, visitor);
  }
  if (isSchemaObject(schema.then)) {
    walkSchema(schema.then, `${path}/then`, root, visitor);
  }
  if (isSchemaObject(schema.else)) {
    walkSchema(schema.else, `${path}/else`, root, visitor);
  }

  // Composition
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const arr = schema[keyword];
    if (arr && Array.isArray(arr)) {
      arr.forEach((item, i) => {
        if (isSchemaObject(item)) {
          walkSchema(item, `${path}/${keyword}/${i}`, root, visitor);
        }
      });
    }
  }

  // Not
  if (isSchemaObject(schema.not)) {
    walkSchema(schema.not, `${path}/not`, root, visitor);
  }

  // Definitions ($defs)
  if (schema.$defs) {
    for (const [key, value] of Object.entries(schema.$defs)) {
      if (isSchemaObject(value)) {
        walkSchema(value, `${path}/$defs/${key}`, root, visitor);
      }
    }
  }
}

/**
 * Get all available rule IDs
 */
export function getAvailableRules(): string[] {
  return LINT_RULES.map((r) => r.id);
}

/**
 * Get rule description by ID
 */
export function getRuleDescription(ruleId: string): string | undefined {
  return LINT_RULES.find((r) => r.id === ruleId)?.description;
}

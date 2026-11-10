import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import noExtraneousDependencies from 'eslint-plugin-import-x/rules/no-extraneous-dependencies';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import prettier from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/coverage/**',
      '**/dist/**',
      '**/*.js',
      '**/*.d.ts',
      'index.ts',
      'packages/cli/bin/**',
    ],
  },
  ...tseslint.configs['flat/recommended'],
  prettier,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser,
      globals: globals.node,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // The full plugin imports minimatch's removed makeRe API in an unused rule.
    // Load the enabled rule through its public subpath export instead.
    plugins: {
      'import-x': {
        rules: { 'no-extraneous-dependencies': noExtraneousDependencies },
      },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: `${import.meta.dirname}/tsconfig.json`,
        }),
      ],
    },
    rules: {
      'no-useless-constructor': 'off',
      'no-unused-expressions': 0,
      'one-var': 0,
      'no-underscore-dangle': [
        0,
        {
          allow: [],
        },
      ],
      'global-require': 0,
      'new-cap': 'off',
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/explicit-function-return-type': 0,
      camelcase: 'off',
      'consistent-return': 0,
      'lines-between-class-members': 'off',
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: true,
          optionalDependencies: false,
          peerDependencies: false,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
];

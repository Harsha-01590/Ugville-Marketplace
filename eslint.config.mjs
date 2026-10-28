// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import stylistic from '@stylistic/eslint-plugin';

// Formatting is enforced by @stylistic below — it replaces Prettier, so no
// Prettier config or eslint-config-prettier runs alongside it.

export default defineConfig(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'allure-report/**',
      'allure-results/**',
      'playwright-report/**',
      'test-results/**',
      'reports/**',
      'src_backup_*/**',
      'bdd_backup_*/**',
      'test.tsx',
      '.auth/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Formatting (Prettier replacement) — applies to every linted file
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/max-len': [
        'error',
        { code: 120, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreRegExpLiterals: true },
      ],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/arrow-parens': ['error', 'always'],
    },
  },
  {
    files: ['src/**/*.ts', 'playwright.config.ts'],
    rules: {
      // General
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-console': 'error',
      // TypeScript strictness
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    // The one sanctioned console sink — everything else logs through Logger
    files: ['src/utils/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Playwright specs: enforce test.step structure and no flaky patterns
    files: ['src/tests/**/*.spec.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': 'off', // env-gated skips are deliberate (see README)
      'playwright/no-wait-for-timeout': 'warn',
      'playwright/expect-expect': 'off', // assertions live in page-object methods
      'playwright/no-conditional-in-test': 'off',
      'playwright/no-conditional-expect': 'off',
      'playwright/no-element-handle': 'error',
      'playwright/no-eval': 'error',
      'playwright/no-force-option': 'warn',
      'playwright/valid-title': 'error',
      // Loop-generated tests pass their tag as a variable, which this rule cannot read;
      // Playwright itself rejects a malformed tag at load time.
      'playwright/valid-test-tags': 'off',
      'playwright/max-nested-describe': ['error', { max: 2 }],
    },
  },
);

// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
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
    files: ['src/**/*.ts', 'playwright.config.ts'],
    rules: {
      // Code standards
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
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
  prettier,
);

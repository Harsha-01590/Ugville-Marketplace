import { FullConfig } from '@playwright/test';
import { rmSync } from 'fs';
import { envConfig } from './env.config';

/**
 * Global Setup — runs once before all tests.
 * Use for one-time login, seed data, or environment validation.
 */
async function globalSetup(_config: FullConfig) {
  console.log(`\n🚀 Global Setup — Environment: ${envConfig.ENV}`);
  console.log(`   Base URL: ${envConfig.BASE_URL}`);

  if (!envConfig.UGVILLE_USERNAME || !envConfig.UGVILLE_PASSWORD) {
    throw new Error(
      `Missing UGVILLE_USERNAME / UGVILLE_PASSWORD for ENV="${envConfig.ENV}". ` +
        `Check .env.${envConfig.ENV} (copy from .env.example).`,
    );
  }
  console.log('');

  // Clear stale Allure results from previous runs, so a report only ever
  // reflects the tests that were actually run this time. Honour
  // ALLURE_RESULTS_DIR — the module-by-module runner points it at
  // reports/<module>/allure-results, and clearing only the default
  // './allure-results' let those per-module folders accumulate across runs
  // (inflating the merged reports/full-suite count).
  rmSync(process.env.ALLURE_RESULTS_DIR || 'allure-results', { recursive: true, force: true });
}

export default globalSetup;

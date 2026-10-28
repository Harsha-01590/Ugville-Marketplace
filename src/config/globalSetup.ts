import { chromium, type FullConfig } from '@playwright/test';
import { rmSync } from 'fs';
import { envConfig } from './env.config';
import { configuredAccounts, hasFreshSession, loginAndSaveSession, storageStatePath } from '@utils/sessionStore';
import { Logger } from '@utils/logger';

/**
 * Global Setup — runs once before all tests.
 * Validates the environment and logs every configured account in once,
 * saving each session to .auth/<ENV>/<account>.json for the fixtures to reuse.
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  Logger.log(`\n🚀 Global Setup — Environment: ${envConfig.ENV}`);
  Logger.log(`   Base URL: ${envConfig.BASE_URL}`);

  if (!envConfig.UGVILLE_USERNAME || !envConfig.UGVILLE_PASSWORD) {
    throw new Error(
      `Missing UGVILLE_USERNAME / UGVILLE_PASSWORD for ENV="${envConfig.ENV}". ` +
        `Check .env.${envConfig.ENV} (copy from .env.example).`,
    );
  }

  // Clear stale Allure results from previous runs, so a report only ever
  // reflects the tests that were actually run this time. Honour
  // ALLURE_RESULTS_DIR — the module-by-module runner points it at
  // reports/<module>/allure-results, and clearing only the default
  // './allure-results' let those per-module folders accumulate across runs
  // (inflating the merged reports/full-suite count).
  rmSync(process.env.ALLURE_RESULTS_DIR || 'allure-results', { recursive: true, force: true });

  await saveAllSessions();
  Logger.log('');
}

/**
 * Logs in every account that has credentials and no fresh saved session, in
 * parallel (each in its own context). A failed secondary login is only a
 * warning: its fixture retries the UI login, and skips when unconfigured.
 */
async function saveAllSessions(): Promise<void> {
  const accounts = configuredAccounts();
  const stale = accounts.filter((a) => !hasFreshSession(a.key));
  accounts
    .filter((a) => !stale.includes(a))
    .forEach((a) => Logger.log(`   🔑 ${a.key}: reusing saved session (${storageStatePath(a.key)})`));
  if (!stale.length) return;

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const results = await Promise.allSettled(stale.map((a) => loginAndSaveSession(browser, a)));
    results.forEach((result, i) => {
      const { key } = stale[i];
      if (result.status === 'fulfilled') {
        Logger.log(`   🔑 ${key}: logged in, session saved`);
      } else if (key === 'primary') {
        throw new Error(`Primary account login failed in globalSetup: ${result.reason}`);
      } else {
        Logger.log(`   ⚠️  ${key}: login failed in globalSetup, its fixture will retry — ${result.reason}`);
      }
    });
  } finally {
    await browser.close();
  }
}

export default globalSetup;

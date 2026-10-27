import * as fs from 'fs';
import * as path from 'path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { LoginPage } from '../modules/auth';
import { Routes } from '../enums/routes.enum';
import { envConfig } from '../config/env.config';
import { registerFinishLoggingInHandler } from './authHelper';

/**
 * Saved login sessions (Playwright storageState: cookies + localStorage).
 *
 * globalSetup logs every configured account in once and saves its session to
 * .auth/<ENV>/<account>.json; fixtures then open each account's context from
 * that file instead of logging in through the UI again. A session that has
 * expired (Salesforce redirects to /login) is re-logged-in and re-saved on the
 * spot, so a stale file never fails a test.
 */

/** Every account the suite can log in as. */
export type AccountKey = 'primary' | 'franchiseB' | 'buyer' | 'coordinator';

export interface Account {
  key: AccountKey;
  /** The .env.<ENV> variable prefix, used in skip / error messages. */
  envPrefix: string;
  username: string;
  password: string;
}

const ACCOUNT_ENV: Record<AccountKey, 'UGVILLE' | 'FRANCHISE_B' | 'BUYER' | 'COORDINATOR'> = {
  primary: 'UGVILLE',
  franchiseB: 'FRANCHISE_B',
  buyer: 'BUYER',
  coordinator: 'COORDINATOR',
};

/**
 * Login is done only once the frontdoor.jsp → hvaCustomLoginPage →
 * CommunitiesLanding hand-off has settled on /ugville/. Leaving /login is not
 * enough: navigating mid-hand-off (seen QA 2026-10-09 on the Franchise B
 * login) lands on a classic "URL No Longer Exists" page instead.
 */
export const landedInUgville = (url: URL) => url.pathname.startsWith('/ugville') && !url.pathname.includes('/login');

export function getAccount(key: AccountKey): Account {
  const envPrefix = ACCOUNT_ENV[key];
  return {
    key,
    envPrefix,
    username: envConfig[`${envPrefix}_USERNAME`].trim(),
    password: envConfig[`${envPrefix}_PASSWORD`].trim(),
  };
}

export function isConfigured(account: Account): boolean {
  return !!account.username && !!account.password;
}

/** Accounts that have credentials in .env.<ENV>; the rest are skipped by the tests that need them. */
export function configuredAccounts(): Account[] {
  return (Object.keys(ACCOUNT_ENV) as AccountKey[]).map(getAccount).filter(isConfigured);
}

export function storageStatePath(key: AccountKey): string {
  return path.resolve('.auth', envConfig.ENV, `${key}.json`);
}

/** True when the saved session exists and is younger than AUTH_SESSION_MAX_AGE_MIN. */
export function hasFreshSession(key: AccountKey): boolean {
  const file = storageStatePath(key);
  if (!fs.existsSync(file)) return false;
  const ageMin = (Date.now() - fs.statSync(file).mtimeMs) / 60_000;
  return ageMin < envConfig.AUTH_SESSION_MAX_AGE_MIN;
}

async function saveSession(context: BrowserContext, key: AccountKey): Promise<void> {
  const file = storageStatePath(key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await context.storageState({ path: file });
}

/** UI login on `page`, waiting for the Ugville hand-off to settle. */
export async function uiLogin(page: Page, account: Account): Promise<void> {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(account.username, account.password);
  await page.waitForURL(landedInUgville, { timeout: 60_000 });
}

/** Logs `account` in through the UI on a fresh context and saves its session. Used by globalSetup. */
export async function loginAndSaveSession(browser: Browser, account: Account): Promise<void> {
  const context = await browser.newContext({ baseURL: envConfig.BASE_URL });
  try {
    const page = await context.newPage();
    await registerFinishLoggingInHandler(page);
    await uiLogin(page, account);
    await saveSession(context, account.key);
  } finally {
    await context.close();
  }
}

/** A new context for `account`, restored from its saved session when one exists. */
export async function newSessionContext(browser: Browser, account: Account): Promise<BrowserContext> {
  const file = storageStatePath(account.key);
  return browser.newContext(fs.existsSync(file) ? { storageState: file } : {});
}

/**
 * Opens Home on `page` and confirms the restored session is still valid. When
 * Salesforce bounces to /login instead (expired or missing session), logs in
 * through the UI and re-saves the session for the next context.
 */
export async function ensureLoggedIn(page: Page, account: Account): Promise<void> {
  await registerFinishLoggingInHandler(page);
  await page.goto(Routes.HOME);
  await page.waitForLoadState('domcontentloaded');
  const onLogin =
    page.url().includes('/login') || (await new LoginPage(page).usernameInput.isVisible().catch(() => false));
  if (!onLogin) return;
  await uiLogin(page, account);
  await saveSession(page.context(), account.key);
}

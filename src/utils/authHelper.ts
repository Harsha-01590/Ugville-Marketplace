import { type Page } from '@playwright/test';
import { LoginPage } from '../modules/auth';

/**
 * Salesforce Experience Cloud occasionally routes an authenticated
 * navigation through a "loginFlowOnly.apexp" SSO handoff interstitial
 * ("Can't Display Page" / "first finish logging in") instead of the
 * requested page — most reliably reproduced when a protected page is
 * requested before any Ugville session cookie exists (e.g. every fresh
 * Playwright browser context). Registers a handler that dismisses it
 * automatically wherever it appears for the life of `page`.
 */
export async function registerFinishLoggingInHandler(page: Page): Promise<void> {
  const finishLoggingInLink = page.getByRole('link', { name: /finish logging in/i });
  await page.addLocatorHandler(finishLoggingInLink, async () => {
    await finishLoggingInLink.click();
    await page.waitForLoadState('domcontentloaded');
  });
}

/**
 * `authedPage` is a worker-scoped fixture — one login shared for the whole
 * worker's lifetime. That's fine for a single module (minutes), but a
 * FULL_SUITE=1 run can span hours, long enough to outlast the Salesforce
 * session. When that happens, navigation lands on the real login form
 * (not the lighter "finish logging in" handoff above) and every test after
 * that point fails on missing elements that are actually just on the wrong
 * page. Registers a handler that detects the login form and re-authenticates
 * transparently wherever it appears, so a mid-run session drop doesn't
 * cascade into a wall of unrelated-looking failures.
 *
 * Only wire this onto `authedPage` — never the plain `page` fixture, which
 * `login.regression.spec.ts`'s negative tests (wrong password, etc.) rely on
 * seeing the real login form themselves.
 */
export async function registerSessionRecoveryHandler(
  page: Page,
  credentials: { username: string; password: string },
): Promise<void> {
  const loginPage = new LoginPage(page);
  await page.addLocatorHandler(loginPage.usernameInput, async () => {
    await loginPage.login(credentials.username, credentials.password);
    await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 60_000 }).catch(() => {});
  });
}

import { test as base } from '@playwright/test';
import type { Page, BrowserContext, Browser } from '@playwright/test';
import { LoginPage } from '../modules/auth';
import { HomePage } from '../modules/dashboard';
import { NotificationsPanelComponent } from '../modules/notifications';
import { MarketplacePage, MarketplaceDealPage } from '../modules/marketplace';
import { SellerLeadPage } from '../modules/seller';
import { ModalComponent } from '../shared';
import * as testDataJson from './data/testData.json';
import { registerFinishLoggingInHandler, registerSessionRecoveryHandler } from '../utils/authHelper';
import { envConfig } from '../config/env.config';

// ---- Strongly typed shape of the test data file ----------------------------------------
// Trimmed to only the sections src/tests/marketplace actually reads (see
// testData.json) — this is the standalone Marketplace project, split out of
// the full ugville_automation suite.
export interface TestData {
  timeouts: { navigation: number; settle: number; afterEach: number };
  marketplace: {
    bidReason: string;
    stageFilter: string;
    bidAcceptedStage: string;
  };
}

const data = testDataJson as TestData;

/**
 * Login is done only once the frontdoor.jsp → hvaCustomLoginPage →
 * CommunitiesLanding hand-off has settled on /ugville/. Leaving /login is not
 * enough: navigating mid-hand-off (seen QA 2026-10-09 on the Franchise B
 * login) lands on a classic "URL No Longer Exists" page instead.
 */
const landedInUgville = (url: URL) => url.pathname.startsWith('/ugville') && !url.pathname.includes('/login');

/** Logs a role account (<ROLE>_USERNAME/PASSWORD) into its own context; skips the test when unset. */
async function roleLogin(browser: Browser, role: 'BUYER' | 'COORDINATOR', use: (page: Page) => Promise<void>) {
  const username = envConfig[`${role}_USERNAME`].trim();
  const password = envConfig[`${role}_PASSWORD`].trim();
  if (!username || !password) test.skip(true, `${role}_USERNAME/${role}_PASSWORD not set in .env.${envConfig.ENV}`);
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerFinishLoggingInHandler(page);
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(username, password);
  await page.waitForURL(landedInUgville, { timeout: 60_000 });
  await use(page);
  await context.close();
}

// ---- Custom fixtures -------------------------------------------------------------------
type WorkerFixtures = {
  authedContext: BrowserContext;
  authedPage: Page;
  // Second-role session for the Marketplace "Buyer role cannot place bids"
  // permission test. Logged in lazily — only that test pays for the extra
  // login, once per worker, same as authedPage.
  buyerRolePage: Page;
  coordinatorRolePage: Page;
  // Second *franchise account* session, for cross-account marketplace flows
  // (list an Opportunity as authedPage's account, then view/accept/verify it
  // as this one). A genuinely separate BrowserContext, not just a second tab
  // on authedContext, so each account keeps its own cookies/session. Logged
  // in lazily and skipped if FRANCHISE_B_USERNAME/PASSWORD are blank, same
  // convention as buyerRolePage.
  franchiseBPage: Page;
  // A second tab on authedPage's login, acting as the owner's other franchise
  // (FRANCHISE_A_OTHER_NAME) through the deal modal's Bidding Franchise dropdown.
  // Franchise B never sees Franchise A's deals (QA 2026-10-26), so this is the
  // counterparty for bidding / Direct Invite flows on Franchise A's listings.
  otherFranchisePage: Page;
};

type TestFixtures = {
  data: TestData;

  // Every test's `page` fixture gets the SSO-interstitial handler too — not
  // just `authedPage` — since a fresh per-test login runs on a brand-new
  // context with no session cookie, which is exactly when Salesforce is most
  // likely to route through it.
  page: Page;

  // --- Component POMs ---
  modalComponent: ModalComponent;
  /**
   * Auto-fixture (see implementation below): closes any stray modal left
   * open on the shared `authedPage` before every test runs. Not meant to be
   * requested directly by tests.
   */
  _dismissStrayModal: void;

  // --- Authed page POMs ---
  authedHomePage: HomePage;
  authedMarketplacePage: MarketplacePage;
  authedMarketplaceDealPage: MarketplaceDealPage;
  authedNotificationsPanelComponent: NotificationsPanelComponent;
  authedSellerLeadPage: SellerLeadPage;

  // --- Franchise B (second account) POMs — mirror the authed* POMs above,
  // wired to franchiseBPage instead of authedPage, for cross-account tests ---
  franchiseBHomePage: HomePage;
  franchiseBMarketplacePage: MarketplacePage;
  franchiseBMarketplaceDealPage: MarketplaceDealPage;
  franchiseBNotificationsPanelComponent: NotificationsPanelComponent;

  // --- The owner's other franchise (second tab on authedPage's login) POMs ---
  otherFranchiseHomePage: HomePage;
  otherFranchiseMarketplacePage: MarketplacePage;
  otherFranchiseMarketplaceDealPage: MarketplaceDealPage;
  otherFranchiseNotificationsPanelComponent: NotificationsPanelComponent;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // -------- Worker-scoped: log in once per worker ----------------
  authedContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],

  authedPage: [
    async ({ authedContext }, use) => {
      const page = await authedContext.newPage();
      await registerFinishLoggingInHandler(page);

      const loginPage = new LoginPage(page);
      await loginPage.navigate();
      await loginPage.login(
        envConfig.UGVILLE_USERNAME.trim(),
        envConfig.UGVILLE_PASSWORD.trim(),
      );
      await page.waitForURL(landedInUgville, { timeout: 60_000 });

      // Registered only after the initial login succeeds — this handler
      // watches the same usernameInput locator the login above just used,
      // so registering it earlier makes it fire mid-login and race the
      // explicit login() call above.
      await registerSessionRecoveryHandler(page, {
        username: envConfig.UGVILLE_USERNAME.trim(),
        password: envConfig.UGVILLE_PASSWORD.trim(),
      });

      await use(page);
    },
    { scope: 'worker' },
  ],

  // Role sessions for the Marketplace permission tests (QA: the BUYER_* user is Franchise B's Buyer
  // and also owns a test franchise; the COORDINATOR_* user is Franchise A's MP Delegate).
  buyerRolePage: [async ({ browser }, use) => roleLogin(browser, 'BUYER', use), { scope: 'worker' }],
  coordinatorRolePage: [async ({ browser }, use) => roleLogin(browser, 'COORDINATOR', use), { scope: 'worker' }],

  // Second franchise account — own BrowserContext, own login, own cookies.
  // Used by cross-account tests (e.g. list an Opportunity on authedPage's
  // account, then switch to this one to view/accept/verify it in the UI).
  franchiseBPage: [
    async ({ browser }, use) => {
      if (!envConfig.FRANCHISE_B_USERNAME || !envConfig.FRANCHISE_B_PASSWORD) {
        test.skip(true, `FRANCHISE_B_USERNAME/FRANCHISE_B_PASSWORD not set in .env.${envConfig.ENV}`);
      }
      const context = await browser.newContext();
      const page = await context.newPage();
      await registerFinishLoggingInHandler(page);

      const loginPage = new LoginPage(page);
      await loginPage.navigate();
      await loginPage.login(
        envConfig.FRANCHISE_B_USERNAME.trim(),
        envConfig.FRANCHISE_B_PASSWORD.trim(),
      );
      await page.waitForURL(landedInUgville, { timeout: 60_000 });

      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],

  // Same context as authedPage, so it shares that login's session cookies.
  otherFranchisePage: [
    async ({ authedPage }, use) => {
      if (!envConfig.FRANCHISE_A_OTHER_NAME) {
        test.skip(true, `FRANCHISE_A_OTHER_NAME not set in .env.${envConfig.ENV}`);
      }
      const page = await authedPage.context().newPage();
      await registerFinishLoggingInHandler(page);
      await use(page);
      await page.close();
    },
    { scope: 'worker' },
  ],

  // `authedPage` is worker-scoped (login happens once per worker, and with
  // `workers: 1` that's once for the entire run), so the same page is reused
  // across every test. If any test leaves a modal open (e.g. Salesforce's
  // periodic "Reminders" dialog), it stays open — and its `slds-modal`
  // overlay intercepts pointer events for every subsequent click — for the
  // rest of the run. `auto: true` makes this run before every test, not just
  // ones that request it, so a stray modal from one test can't cascade into
  // failures across the rest of the suite.
  //
  // Also closes a stray "Recently Visited Leads" sidebar for the same reason
  // — it isn't a `slds-modal`, so `ModalComponent` doesn't catch it, but it
  // visually overlays the Home dashboard the same way.
  _dismissStrayModal: [
    async ({ authedPage }, use) => {
      await new ModalComponent(authedPage).closeAnyOpenModal();
      await new HomePage(authedPage).closeRecentlyVisitedLeadsIfOpen();
      await use();
    },
    { auto: true },
  ],

  // -------- Test-scoped data ----------------
  data: async ({}, use) => { await use(data); },

  page: async ({ page }, use) => {
    await registerFinishLoggingInHandler(page);
    await use(page);
  },

  // --- Component POMs ---
  modalComponent: async ({ page }, use) => { await use(new ModalComponent(page)); },

  // --- Authed page POMs ---
  authedHomePage: async ({ authedPage }, use) => { await use(new HomePage(authedPage)); },
  authedMarketplacePage: async ({ authedPage }, use) => { await use(new MarketplacePage(authedPage)); },
  authedMarketplaceDealPage: async ({ authedPage }, use) => { await use(new MarketplaceDealPage(authedPage)); },
  authedNotificationsPanelComponent: async ({ authedPage }, use) => { await use(new NotificationsPanelComponent(authedPage)); },
  authedSellerLeadPage: async ({ authedPage }, use) => { await use(new SellerLeadPage(authedPage)); },

  // --- Franchise B (second account) POMs ---
  franchiseBHomePage: async ({ franchiseBPage }, use) => { await use(new HomePage(franchiseBPage)); },
  franchiseBMarketplacePage: async ({ franchiseBPage }, use) => { await use(new MarketplacePage(franchiseBPage)); },
  franchiseBMarketplaceDealPage: async ({ franchiseBPage }, use) => { await use(new MarketplaceDealPage(franchiseBPage)); },
  franchiseBNotificationsPanelComponent: async ({ franchiseBPage }, use) => { await use(new NotificationsPanelComponent(franchiseBPage)); },

  // --- The owner's other franchise POMs ---
  otherFranchiseHomePage: async ({ otherFranchisePage }, use) => { await use(new HomePage(otherFranchisePage)); },
  otherFranchiseMarketplacePage: async ({ otherFranchisePage }, use) => { await use(new MarketplacePage(otherFranchisePage)); },
  otherFranchiseMarketplaceDealPage: async ({ otherFranchisePage }, use) => { await use(new MarketplaceDealPage(otherFranchisePage)); },
  otherFranchiseNotificationsPanelComponent: async ({ otherFranchisePage }, use) => { await use(new NotificationsPanelComponent(otherFranchisePage)); },
});

export { expect } from '@playwright/test';

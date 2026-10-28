import { test as base } from '@playwright/test';
import type { Page, BrowserContext, Browser } from '@playwright/test';
import { HomePage } from '@modules/dashboard';
import { NotificationsPanelComponent, NotificationSettingsPage } from '@modules/notifications';
import { MarketplacePage, MarketplaceDealPage } from '@modules/marketplace';
import { SellerLeadPage } from '@modules/seller';
import { ModalComponent } from '../shared/components/ModalComponent';
import * as testDataJson from './data/testData.json';
import { registerFinishLoggingInHandler, registerSessionRecoveryHandler } from '@utils/authHelper';
import { ensureLoggedIn, getAccount, isConfigured, newSessionContext, type AccountKey } from '@utils/sessionStore';
import { envConfig } from '@config/env.config';
import { Routes } from '@enums/routes.enum';

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
 * Opens a logged-in page for `key` in its own context, restored from the
 * session globalSetup saved (see utils/sessionStore). Skips the test when the
 * account has no credentials in .env.<ENV>.
 */
async function sessionPage(browser: Browser, key: AccountKey, use: (page: Page) => Promise<void>): Promise<void> {
  const account = getAccount(key);
  if (!isConfigured(account)) {
    test.skip(true, `${account.envPrefix}_USERNAME/${account.envPrefix}_PASSWORD not set in .env.${envConfig.ENV}`);
  }
  const context = await newSessionContext(browser, account);
  const page = await context.newPage();
  await ensureLoggedIn(page, account);
  // Registered only after the session is confirmed — the handler watches the
  // login form, so registering it earlier would race the login itself.
  await registerSessionRecoveryHandler(page, account);
  await use(page);
  await context.close();
}

// ---- Custom fixtures -------------------------------------------------------------------
interface WorkerFixtures {
  authedContext: BrowserContext;
  authedPage: Page;
  // Second-role sessions for the Marketplace permission tests (QA: the BUYER_*
  // user is Franchise B's Buyer and also owns a test franchise; the
  // COORDINATOR_* user is Franchise A's MP Delegate). Opened lazily — only
  // tests that request them pay for the extra context, once per worker.
  buyerRolePage: Page;
  coordinatorRolePage: Page;
  // Second *franchise account* session, for cross-account marketplace flows
  // (list an Opportunity as authedPage's account, then view/accept/verify it
  // as this one). A genuinely separate BrowserContext, not just a second tab
  // on authedContext, so each account keeps its own cookies/session. Skipped
  // if FRANCHISE_B_USERNAME/PASSWORD are blank, same as buyerRolePage.
  franchiseBPage: Page;
  // A second tab on authedPage's login, acting as the owner's other franchise
  // (FRANCHISE_A_OTHER_NAME) through the deal modal's Bidding Franchise dropdown.
  // Franchise B never sees Franchise A's deals (QA 2026-10-26), so this is the
  // counterparty for bidding / Direct Invite flows on Franchise A's listings.
  otherFranchisePage: Page;
}

interface TestFixtures {
  data: TestData;

  // Every test's `page` fixture gets the SSO-interstitial handler too — not
  // just `authedPage` — since a fresh per-test page runs on a brand-new
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
  /**
   * Auto-fixture teardown: after every test, lets any in-flight Salesforce
   * save on `authedPage` finish (spinner gone) before the next test starts.
   */
  _settleAfterTest: void;

  // --- Authed page POMs ---
  authedHomePage: HomePage;
  authedMarketplacePage: MarketplacePage;
  authedMarketplaceDealPage: MarketplaceDealPage;
  authedNotificationsPanelComponent: NotificationsPanelComponent;
  authedSellerLeadPage: SellerLeadPage;
  authedNotificationSettingsPage: NotificationSettingsPage;

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
  otherFranchiseSellerLeadPage: SellerLeadPage;
  franchiseBSellerLeadPage: SellerLeadPage;

  // --- Marketplace Delegate (coordinatorRolePage) and Buyer (buyerRolePage) role POMs ---
  coordinatorHomePage: HomePage;
  coordinatorSellerLeadPage: SellerLeadPage;
  coordinatorMarketplacePage: MarketplacePage;
  coordinatorMarketplaceDealPage: MarketplaceDealPage;
  buyerSellerLeadPage: SellerLeadPage;
  buyerMarketplacePage: MarketplacePage;
  buyerMarketplaceDealPage: MarketplaceDealPage;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // -------- Worker-scoped: restore each account's saved session once per worker ----------------
  authedContext: [
    async ({ browser }, use) => {
      const context = await newSessionContext(browser, getAccount('primary'));
      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],

  authedPage: [
    async ({ authedContext }, use) => {
      const account = getAccount('primary');
      const page = await authedContext.newPage();
      await ensureLoggedIn(page, account);
      // Registered only after the session is confirmed — this handler watches
      // the same usernameInput locator a fallback login would use, so
      // registering it earlier makes it fire mid-login and race that login.
      await registerSessionRecoveryHandler(page, account);
      await use(page);
    },
    { scope: 'worker' },
  ],

  buyerRolePage: [async ({ browser }, use) => sessionPage(browser, 'buyer', use), { scope: 'worker' }],
  coordinatorRolePage: [async ({ browser }, use) => sessionPage(browser, 'coordinator', use), { scope: 'worker' }],
  franchiseBPage: [async ({ browser }, use) => sessionPage(browser, 'franchiseB', use), { scope: 'worker' }],

  // Same context as authedPage, so it shares that login's session cookies.
  otherFranchisePage: [
    async ({ authedPage }, use) => {
      if (!envConfig.FRANCHISE_A_OTHER_NAME) {
        test.skip(true, `FRANCHISE_A_OTHER_NAME not set in .env.${envConfig.ENV}`);
      }
      const page = await authedPage.context().newPage();
      await registerFinishLoggingInHandler(page);
      // A new tab on a cached-session context starts blank — navigate for real before any test uses it.
      await page.goto(Routes.HOME);
      await page.waitForLoadState('domcontentloaded');
      await use(page);
      await page.close();
    },
    { scope: 'worker' },
  ],

  // `authedPage` is worker-scoped (one session per worker), so the same page
  // is reused across every test. If any test leaves a modal open (e.g.
  // Salesforce's periodic "Reminders" dialog), it stays open — and its
  // `slds-modal` overlay intercepts pointer events for every subsequent
  // click — for the rest of the run. `auto: true` makes this run before every
  // test, not just ones that request it, so a stray modal from one test can't
  // cascade into failures across the rest of the suite.
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

  _settleAfterTest: [
    async ({ authedPage, data }, use) => {
      await use();
      await new ModalComponent(authedPage).waitForSpinner(data.timeouts.afterEach);
    },
    { auto: true },
  ],

  // -------- Test-scoped data ----------------
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument
  data: async ({}, use) => {
    await use(data);
  },

  page: async ({ page }, use) => {
    await registerFinishLoggingInHandler(page);
    await use(page);
  },

  // --- Component POMs ---
  modalComponent: async ({ page }, use) => {
    await use(new ModalComponent(page));
  },

  // --- Authed page POMs ---
  authedHomePage: async ({ authedPage }, use) => {
    await use(new HomePage(authedPage));
  },
  authedMarketplacePage: async ({ authedPage }, use) => {
    await use(new MarketplacePage(authedPage));
  },
  authedMarketplaceDealPage: async ({ authedPage }, use) => {
    await use(new MarketplaceDealPage(authedPage));
  },
  authedNotificationsPanelComponent: async ({ authedPage }, use) => {
    await use(new NotificationsPanelComponent(authedPage));
  },
  authedSellerLeadPage: async ({ authedPage }, use) => {
    await use(new SellerLeadPage(authedPage));
  },
  authedNotificationSettingsPage: async ({ authedPage }, use) => {
    await use(new NotificationSettingsPage(authedPage));
  },

  // --- Franchise B (second account) POMs ---
  franchiseBHomePage: async ({ franchiseBPage }, use) => {
    await use(new HomePage(franchiseBPage));
  },
  franchiseBMarketplacePage: async ({ franchiseBPage }, use) => {
    await use(new MarketplacePage(franchiseBPage));
  },
  franchiseBMarketplaceDealPage: async ({ franchiseBPage }, use) => {
    await use(new MarketplaceDealPage(franchiseBPage));
  },
  franchiseBNotificationsPanelComponent: async ({ franchiseBPage }, use) => {
    await use(new NotificationsPanelComponent(franchiseBPage));
  },

  // --- The owner's other franchise POMs ---
  otherFranchiseHomePage: async ({ otherFranchisePage }, use) => {
    await use(new HomePage(otherFranchisePage));
  },
  otherFranchiseMarketplacePage: async ({ otherFranchisePage }, use) => {
    await use(new MarketplacePage(otherFranchisePage));
  },
  otherFranchiseMarketplaceDealPage: async ({ otherFranchisePage }, use) => {
    await use(new MarketplaceDealPage(otherFranchisePage));
  },
  otherFranchiseNotificationsPanelComponent: async ({ otherFranchisePage }, use) => {
    await use(new NotificationsPanelComponent(otherFranchisePage));
  },
  otherFranchiseSellerLeadPage: async ({ otherFranchisePage }, use) => {
    await use(new SellerLeadPage(otherFranchisePage));
  },
  franchiseBSellerLeadPage: async ({ franchiseBPage }, use) => {
    await use(new SellerLeadPage(franchiseBPage));
  },

  // --- Marketplace Delegate and Buyer role POMs ---
  coordinatorHomePage: async ({ coordinatorRolePage }, use) => {
    await use(new HomePage(coordinatorRolePage));
  },
  coordinatorSellerLeadPage: async ({ coordinatorRolePage }, use) => {
    await use(new SellerLeadPage(coordinatorRolePage));
  },
  coordinatorMarketplacePage: async ({ coordinatorRolePage }, use) => {
    await use(new MarketplacePage(coordinatorRolePage));
  },
  coordinatorMarketplaceDealPage: async ({ coordinatorRolePage }, use) => {
    await use(new MarketplaceDealPage(coordinatorRolePage));
  },
  buyerSellerLeadPage: async ({ buyerRolePage }, use) => {
    await use(new SellerLeadPage(buyerRolePage));
  },
  buyerMarketplacePage: async ({ buyerRolePage }, use) => {
    await use(new MarketplacePage(buyerRolePage));
  },
  buyerMarketplaceDealPage: async ({ buyerRolePage }, use) => {
    await use(new MarketplaceDealPage(buyerRolePage));
  },
});

export { expect } from '@playwright/test';

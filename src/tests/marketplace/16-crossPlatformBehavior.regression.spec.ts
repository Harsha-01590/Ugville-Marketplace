import { test, expect } from '../../fixtures/testFixtures';
import type { Page } from '@playwright/test';
import type { HomePage } from '../../modules/dashboard';
import type { TestData } from '../../fixtures/testFixtures';
import { Routes } from '../../enums/routes.enum';

/**
 * Workflow suite for the Marketplace_Master sheet's workflow:
 * "Cross-Platform Behavior (Web / Mobile / Email)"
 * (see the sheet's Workflow Summary / Automation Categorization tabs).
 *
 * Some tests here moved from the former marketplaceFilters.regression.spec.ts — its
 * scope notes now live in 04-browseMapViewFiltersSearch.regression.spec.ts.
 *
 * Some tests here moved from the former marketplaceMessagesPlatform.regression.spec.ts — its
 * scope notes now live in 14-messagingToastsErrorsContextualCopy.regression.spec.ts.
 */

async function resetToHome(authedPage: Page, authedHomePage: HomePage, data: TestData) {
  await authedHomePage.navigate();
  await authedPage.waitForLoadState('domcontentloaded');
  await authedPage.waitForTimeout(data.timeouts.settle);
}

async function settleAfter(authedPage: Page, data: TestData) {
  await authedPage.waitForTimeout(data.timeouts.afterEach);
}

test.describe('Cross-Platform Behavior (Web / Mobile / Email) @regression @MarketplaceCrossPlatformBehavior', () => {
  // =====================================================================
  // Dynamic Links (DL_001)
  // =====================================================================

  test(
    'Deal detail source-opportunity link targets the current environment @regression',
    { tag: '@XPLAT-01' },
    async ({ authedPage, data, authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Open the Marketplace', async () => {
        await resetToHome(authedPage, authedHomePage, data);
        console.log("Checking the deal detail's link back to its source Opportunity");
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getItemCount();
      });

      if (count === 0) {
        console.log('No deals available — skipped');
      } else {
        await test.step('Open the first deal', async () => {
          await authedMarketplacePage.clickFirstItem();
          await authedMarketplaceDealPage.expectLoaded();
        });

        await test.step('Verify the source-opportunity link targets the current environment', async () => {
          const href = await authedMarketplaceDealPage.getSourceOpportunityLinkHref();
          console.log(`Source Opportunity link = ${href}`);
          if (href) {
            expect(href).toContain(new URL(authedPage.url()).hostname);
          } else {
            console.log('No source-opportunity link found on this deal — inconclusive');
          }
        });
      }

      await settleAfter(authedPage, data);
    },
  );

  // =====================================================================
  // MSG_028: Marketplace is served at /market-place/
  // =====================================================================

  // Covers: MSG_028
  test(
    'Marketplace listing page is served at the /market-place/ URL @regression',
    { tag: '@XPLAT-02' },
    async ({ authedPage, data, authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await resetToHome(authedPage, authedHomePage, data);
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Verify the URL is /market-place/', async () => {
        console.log(`URL = "${authedPage.url()}"`);
        expect(authedPage.url()).toContain(Routes.MARKETPLACE);
      });

      await settleAfter(authedPage, data);
    },
  );

  // Covers: SAN_061
  test(
    'Opening /market-place/ directly loads the listing with Available deals @regression',
    { tag: '@XPLAT-03' },
    async ({ authedPage, data, authedHomePage, authedMarketplacePage }) => {
      await test.step('Open /market-place/ directly with filters reset', async () => {
        await resetToHome(authedPage, authedHomePage, data);
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Verify the listing loads with Available deals', async () => {
        expect(authedPage.url()).toContain(Routes.MARKETPLACE);
        expect(await authedMarketplacePage.getDealCardCount(), 'Available deals shown').toBeGreaterThan(0);
      });

      await settleAfter(authedPage, data);
    },
  );

  // Covers: SAN_062, MSG_029
  test(
    'The Home Marketplace quick link opens Marketplace in a new tab and keeps Home open @regression',
    { tag: '@XPLAT-04' },
    async ({ authedPage, data, authedHomePage }) => {
      const homeUrl = await test.step('Open Home', async () => {
        await resetToHome(authedPage, authedHomePage, data);
        return authedPage.url();
      });

      const tab = await test.step('Click the Marketplace quick link and wait for the new tab', async () => {
        const newTab = authedPage.context().waitForEvent('page', { timeout: 15000 });
        await authedHomePage.marketplaceQuickLink.click();
        return newTab;
      });

      try {
        await test.step('Verify the new tab opens the Marketplace and Home stays open', async () => {
          // The new tab hops through redirects, so poll its URL rather than wait for a navigation.
          await expect.poll(() => tab.url(), { timeout: 30000 }).toContain(Routes.MARKETPLACE);
          expect(authedPage.url(), 'Home tab stays where it was').toBe(homeUrl);
        });
      } finally {
        await tab.close();
      }

      await settleAfter(authedPage, data);
    },
  );
});

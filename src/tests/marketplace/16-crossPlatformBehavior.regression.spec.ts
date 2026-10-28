import { test, expect } from '@fixtures/testFixtures';
import { Routes } from '@enums/routes.enum';
import { Logger } from '@utils/logger';

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

test.describe('Cross-Platform Behavior (Web / Mobile / Email) @regression @MarketplaceCrossPlatformBehavior', () => {
  // =====================================================================
  // Dynamic Links (DL_001)
  // =====================================================================

  test(
    'Deal detail source-opportunity link targets the current environment @regression',
    { tag: '@XPLAT-01' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        Logger.log("Checking the deal detail's link back to its source Opportunity");
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getItemCount();
      });

      test.skip(count === 0, 'No deals available in current sandbox state');

      const href = await test.step('Open the first deal and read its source-opportunity link', async () => {
        await authedMarketplacePage.clickFirstItem();
        await authedMarketplaceDealPage.expectLoaded();
        const link = await authedMarketplaceDealPage.getSourceOpportunityLinkHref();
        Logger.log(`Source Opportunity link = ${link}`);
        return link;
      });

      test.skip(!href, 'No source-opportunity link found on this deal');

      await test.step('Verify the source-opportunity link targets the current environment', async () => {
        expect(href).toContain(authedMarketplaceDealPage.getCurrentHostname());
      });
    },
  );

  // =====================================================================
  // MSG_028: Marketplace is served at /market-place/
  // =====================================================================

  // Covers: MSG_028
  test(
    'Marketplace listing page is served at the /market-place/ URL @regression',
    { tag: '@XPLAT-02' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Verify the URL is /market-place/', async () => {
        Logger.log(`URL = "${authedMarketplacePage.getCurrentUrl()}"`);
        expect(authedMarketplacePage.getCurrentUrl()).toContain(Routes.MARKETPLACE);
      });
    },
  );

  // Covers: SAN_061
  test(
    'Opening /market-place/ directly loads the listing with Available deals @regression',
    { tag: '@XPLAT-03' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open /market-place/ directly with filters reset', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Verify the listing loads with Available deals', async () => {
        expect(authedMarketplacePage.getCurrentUrl()).toContain(Routes.MARKETPLACE);
        expect(await authedMarketplacePage.getDealCardCount(), 'Available deals shown').toBeGreaterThan(0);
      });
    },
  );

  // Covers: SAN_062, MSG_029
  test(
    'The Home Marketplace quick link opens Marketplace in a new tab and keeps Home open @regression',
    { tag: '@XPLAT-04' },
    async ({ authedHomePage }) => {
      const homeUrl = await test.step('Open the Home page and note its URL', async () => {
        await authedHomePage.openAndSettle();
        return authedHomePage.getCurrentUrl();
      });

      const tab = await test.step('Click the Marketplace quick link and wait for the new tab', async () => {
        return authedHomePage.openMarketplaceQuickLinkInNewTab();
      });

      try {
        await test.step('Verify the new tab opens the Marketplace and Home stays open', async () => {
          // The new tab hops through redirects, so poll its URL rather than wait for a navigation.
          await expect.poll(() => tab.getCurrentUrl(), { timeout: 30000 }).toContain(Routes.MARKETPLACE);
          expect(authedHomePage.getCurrentUrl(), 'Home tab stays where it was').toBe(homeUrl);
        });
      } finally {
        await test.step('Close the Marketplace tab', async () => {
          await tab.closeTab();
        });
      }
    },
  );
});

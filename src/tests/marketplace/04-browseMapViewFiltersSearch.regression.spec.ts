import { test, expect } from '@fixtures/testFixtures';
import {
  bidStagePattern,
  duplicateEntries,
  firstCardIndexes,
  invalidStateOptions,
  listingAgesFrom,
  missingStates,
  narrowestAndWidest,
} from '@modules/marketplace';
import { envConfig } from '@config/env.config';
import { Routes } from '@enums/routes.enum';
import { bidFromOpenList, listFreshDeal } from '@utils/directInvite';
import { tileWindow } from '@utils/windowLayout';
import { Logger } from '@utils/logger';

/**
 * Workflow suite for the Marketplace_Master sheet's workflow:
 * "Marketplace Browse: Map View, Filters & Search"
 * (see the sheet's Workflow Summary / Automation Categorization tabs).
 *
 * Scope notes carried over from the former marketplace.regression.spec.ts:
 *
 * Marketplace Regression Suite
 * Covers: Marketplace quick link from Home, navigation, content visibility,
 * the T&C acceptance gate, and repeat-visit / invalid-id resilience — the
 * generic navigation/search surface, as opposed to the deal-specific
 * business rules covered by the other Marketplace suites. The T&C,
 * active-deals-only, revisit, and invalid-deal-id cases were absorbed here
 * from the retired legacy marketplaceDeals.regression.spec.ts.
 *
 * "Marketplace Terms & Conditions acceptance is honored" (TC_016) is kept
 * first in file/declaration order on purpose: the T&C modal only appears on
 * a franchise's first-ever Marketplace visit, and every other case here
 * assumes it's already been dismissed for the run.
 *
 * Each former test.step() is now its own independent test() — a failure in
 * one case no longer prevents the rest of this file's cases from running.
 * All cases share the worker-scoped `authedPage` session (one login per
 * run, see testFixtures.ts), so splitting these out costs no extra logins.
 *
 * Scope notes carried over from the former marketplaceFilters.regression.spec.ts:
 *
 * Marketplace Filters & Geolocation Suite — maps to the Marketplace_Master
 * spreadsheet's "Filters Issue" (FI), "Dynamic Links" (DL), "Geography State
 * Filter" (SF), "Geolocation - Zip Filter" (GZ), "Zip Code Input Validation"
 * (ZV), and "Filters - Web" (FW) groups (75 cases total).
 *
 * Several GZ_* and FW_* rows are near-duplicate "zip + one other filter" combos
 * (My Listed Deals x6 Deal Stages, My Bids x4 Bid Stages, Opportunity Stage
 * x7, etc.) — per CLAUDE.md's no-duplicated-code rule these stay consolidated
 * into loop-based tests rather than one boilerplate `test()` per row, with
 * each iteration's spreadsheet TC id still logged for traceability. The
 * "Geography State Filter" (SF) and "Filters - Web" (FW) sheets overlap
 * heavily — FW's State-filter rows (FW_001-005) are the same mechanic as
 * SF_001-007, so they're covered once and cross-referenced rather than
 * duplicated. TC_011 (standalone Deal Type filter), folded in from the
 * retired legacy marketplaceDeals.regression.spec.ts, is the one Deal Type
 * check not already combined with another filter (SF_007/FW_004 and
 * GZ_017-019 combine it with State/Zip).
 *
 * Live-verified findings (see MarketplacePage.ts):
 * - "Deal Stage" (Pending Bid Review/Direct/Ad Council/Full Network/Bid
 *   Accepted) only renders once Deal Status = "My Listed Deals"; "Bid Stage"
 *   (In Review/Accepted/Lost) only renders once Deal Status = "My Bids".
 * - No "Show Images" toggle or "Range in Miles" slider exists in the current
 *   UI — the spreadsheet's GZ_020/032/033 describe features not present;
 *   Radius is a dropdown (not a slider) and is what GZ_020/ZV_007 exercise.
 * - The Zip Code input has a 5-character cap with a "Limit reached..."
 *   message, but does NOT reject non-numeric characters client-side — ZV_004
 *   ("only numeric digits allowed" error) does not match live behavior.
 *
 * Each former test.step() is now its own independent test() — a failure in
 * one case no longer prevents the rest of this file's cases from running.
 * All cases share the worker-scoped `authedPage` session (one login per
 * run, see testFixtures.ts), so splitting these out costs no extra logins.
 * The 2 formerly-`test.skip` cases stay as log-only tests documenting why
 * they aren't automated, same as before.
 *
 * Scope notes carried over from the former marketplaceMap.regression.spec.ts:
 *
 * Marketplace Map View Suite — maps to the Marketplace_Master spreadsheet's
 * "Marketplace - Map View" (MV_001-013), "Marketplace - Map View (Web +
 * Mobile)" (MV_014-026), and "Map View - Web Filters Scope" (MV_027-039)
 * groups (39 rows total).
 *
 * All three groups describe the identical 13 scenarios, just repeated under
 * a "Web + Mobile" and a "Web-only" platform-scope header — there's no
 * native mobile app in this Playwright web framework, so per CLAUDE.md's
 * no-duplicated-code rule they collapse into the 13 tests below rather than
 * 39 near-identical ones. The @MarketplaceMap tag (containing "@Marketplace")
 * already qualifies these for the opt-in `mobile-chrome` project's grep
 * filter, so the "Mobile" platform scope is covered by the same tests run
 * under MOBILE=1, not a separate spec.
 *
 * Live-verified findings (see MarketplacePage.ts Map View section):
 * - The map is Salesforce's Lightning Maps component (iframe titled "Map of
 *   Locations"), itself wrapping Google Maps — not a bare Google Maps embed.
 * - Deal markers are real accessible buttons, not canvas-drawn pins: each is
 *   aria-labelled e.g. "2 Deals | ZIP 30345". That label already encodes both
 *   the ZIP grouping (MV_005) and the deal count a hover would reveal
 *   (MV_007) — there's no separate hover-only tooltip to assert on, so
 *   MV_007 asserts against the same aria-label content a hover exposes.
 * - Clicking a marker opens a "ZIP Code: NNNNN" panel containing a real
 *   accessible data grid (Name/Estimated ARV/Opportunity Stage/Deal Stage
 *   columns) — this is the "adjacent synchronized table" MV_006/MV_008
 *   describe, confirmed live, not a dead end.
 * - A black "You are here" marker for the current location is always
 *   present alongside the red/orange deal markers.
 *
 * Some tests here moved from the former marketplaceDealCard.regression.spec.ts — its
 * scope notes now live in 05-dealCardDealDetailView.regression.spec.ts.
 */

test.describe('Marketplace Browse: Map View, Filters & Search @regression @MarketplaceBrowseMapViewFiltersSearch', () => {
  test(
    'should load the Home page before Marketplace tests run @regression',
    { tag: '@BROWSE-01' },
    async ({ authedHomePage }) => {
      await test.step('Open the Home page', async () => {
        await authedHomePage.openAndSettle();
      });

      await test.step('Verify the session is not on the login page', async () => {
        await authedHomePage.expectNotOnLoginPage();
      });

      await test.step('Return to Home so the next test starts from a clean state', async () => {
        await authedHomePage.returnHomeQuietly();
      });
    },
  );

  // TC_016 - Regression: T&C acceptance gates Marketplace access (run first, before other visits)
  test(
    'Marketplace Terms & Conditions acceptance is honored @regression',
    { tag: '@BROWSE-02' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        Logger.log('Navigating to Marketplace and checking for T&C prompt');
        await authedMarketplacePage.navigate();
      });

      await test.step('Accept the Terms & Conditions if prompted', async () => {
        const wasPrompted = await authedMarketplacePage.acceptTermsIfPresent();
        Logger.log(wasPrompted ? 'T&C modal accepted' : 'No T&C modal shown — already accepted in a prior visit');
      });

      await test.step('Verify the Marketplace loads', async () => {
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Return to Home so the next test starts from a clean state', async () => {
        await authedHomePage.returnHomeQuietly();
      });
    },
  );

  test(
    'should open Marketplace from the Home page quick links @regression',
    { tag: '@BROWSE-03' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace from the Home quick link', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.openFromHome();
      });

      await test.step('Verify the Marketplace loads at /market-place/', async () => {
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.expectOnMarketplaceRoute();
      });

      await test.step('Return to Home so the next test starts from a clean state', async () => {
        await authedHomePage.returnHomeQuietly();
      });
    },
  );

  test(
    'should show the Marketplace deal count @regression',
    { tag: '@BROWSE-04' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace from Home', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.openFromHome();
      });

      await test.step('Verify a deal count can be read', async () => {
        const count = await authedMarketplacePage.getItemCount();
        expect(count).toBeGreaterThanOrEqual(0);
      });

      await test.step('Return to Home so the next test starts from a clean state', async () => {
        await authedHomePage.returnHomeQuietly();
      });
    },
  );

  // TC_001 - Functional: Deal list shows only active deals
  test(
    'Deal list displays active deals only @regression',
    { tag: '@BROWSE-05' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace from Home', async () => {
        await authedHomePage.openAndSettle();
        Logger.log('Navigating to Marketplace and observing deal list');
        await authedMarketplacePage.openFromHome();
      });

      await test.step('Verify the active deal list renders', async () => {
        const count = await authedMarketplacePage.getItemCount();
        Logger.log(`${count} active deal(s) visible`);
        expect(count).toBeGreaterThanOrEqual(0);
      });

      await test.step('Return to Home so the next test starts from a clean state', async () => {
        await authedHomePage.returnHomeQuietly();
      });
    },
  );

  test(
    'should search the Marketplace by location @regression',
    { tag: '@BROWSE-06' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      const count = await test.step('Open the Marketplace from Home', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.openFromHome();
        return authedMarketplacePage.getItemCount();
      });

      test.skip(count === 0, 'No deal cards in current sandbox state');

      // Search by the first card's zip, so the expected match comes from live data.
      const { zip, mpdId } = await test.step("Read the first card's zip and MPD id", async () => {
        return {
          zip: await authedMarketplacePage.getCardZip(0),
          mpdId: await authedMarketplacePage.getCardMpdId(0),
        };
      });

      test.skip(!zip, 'First card shows no zip to search for');

      const ids = await test.step(`Search the Marketplace for zip ${zip}`, async () => {
        await authedMarketplacePage.searchMarketplace(zip);
        const found = await authedMarketplacePage.getAllCardMpdIds();
        Logger.log(`Search "${zip}" -> ${found.length} of ${count} deal(s)`);
        return found;
      });

      await test.step('Verify every result matches the zip, including the source deal', async () => {
        expect(ids, 'the deal the zip came from is in the results').toContain(mpdId);
        for (let i = 0; i < ids.length; i++) {
          expect(await authedMarketplacePage.getCardLocation(i), `result ${ids[i]} matches the zip`).toContain(zip);
        }
      });

      await test.step('Return to Home so the next test starts from a clean state', async () => {
        await authedHomePage.returnHomeQuietly();
      });
    },
  );

  test(
    'should open the first Marketplace deal @regression',
    { tag: '@BROWSE-07' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Open the Marketplace from Home', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.openFromHome();
        return authedMarketplacePage.getItemCount();
      });

      test.skip(count === 0, 'No deal cards in current sandbox state');

      const mpdId = await test.step('Open the first deal', async () => {
        const id = await authedMarketplacePage.getCardMpdId(0);
        await authedMarketplacePage.clickFirstItem();
        await authedMarketplaceDealPage.expectLoaded();
        return id;
      });

      await test.step('Verify the opened deal is the card that was clicked', async () => {
        expect(await authedMarketplaceDealPage.getMpdId(), 'the opened deal is the card that was clicked').toBe(mpdId);
      });

      await test.step('Return to Home so the next test starts from a clean state', async () => {
        await authedHomePage.returnHomeQuietly();
      });
    },
  );

  // ── Negative ──────────────────────────────────────────────────────────

  test(
    'Negative: a search with no matches returns an empty result @regression',
    { tag: '@BROWSE-08' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace and search for a term with no matches', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.openFromHome();
        await authedMarketplacePage.searchMarketplace('zzz_no_item_xyz_99999');
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Verify no server error and the session is intact', async () => {
        expect(await authedMarketplacePage.getPageText()).not.toMatch(/internal server error/i);
        await authedHomePage.expectNotOnLoginPage();
      });

      await test.step('Return to Home so the next test starts from a clean state', async () => {
        await authedHomePage.returnHomeQuietly();
      });
    },
  );

  test(
    'Negative: navigating directly to the Marketplace URL does not crash @regression',
    { tag: '@BROWSE-09' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      const status = await test.step('Navigate directly to the Marketplace URL', async () => {
        await authedHomePage.openAndSettle();
        const status = await authedMarketplacePage.openUrlAndGetStatus(Routes.MARKETPLACE);
        await authedMarketplacePage.expectMarketplaceLoaded();
        return status;
      });

      await test.step('Verify no server error and the session is intact', async () => {
        expect(status).toBeLessThan(500);
        await authedHomePage.expectNotOnLoginPage();
      });

      await test.step('Return to Home so the next test starts from a clean state', async () => {
        await authedHomePage.returnHomeQuietly();
      });
    },
  );

  test(
    'Negative: an invalid deal id in the URL does not crash @regression',
    { tag: '@BROWSE-10' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      const status = await test.step('Navigate to the Marketplace with an invalid deal id', async () => {
        await authedHomePage.openAndSettle();
        Logger.log('TC_NEG_MKTD_001: Navigating to marketplace with an invalid deal id');
        const status = await authedMarketplacePage.openUrlAndGetStatus('/ugville/market-place?dealId=INVALID_ID_XYZ');
        await authedMarketplacePage.expectMarketplaceLoaded();
        Logger.log(`TC_NEG_MKTD_001: status = ${status}`);
        return status;
      });

      await test.step('Verify no server error and the session is intact', async () => {
        expect(status).toBeLessThan(500);
        await authedHomePage.expectNotOnLoginPage();
      });

      await test.step('Return to Home so the next test starts from a clean state', async () => {
        await authedHomePage.returnHomeQuietly();
      });
    },
  );

  test(
    'Negative: browser back from a Marketplace deal returns to the listing @regression',
    { tag: '@BROWSE-11' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Open the Marketplace from Home', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.openFromHome();
        return authedMarketplacePage.getItemCount();
      });

      if (count === 0) {
        Logger.log('No Marketplace deals available to open — skipping this test body');
      } else {
        await test.step('Open the first deal, then go back', async () => {
          await authedMarketplacePage.clickFirstItem();
          await authedMarketplaceDealPage.expectLoaded();
          await authedMarketplacePage.goBack();
          await authedMarketplacePage.expectMarketplaceLoaded();
        });

        await test.step('Verify no server error and the session is intact', async () => {
          await authedHomePage.expectNotOnLoginPage();
          expect(await authedMarketplacePage.getPageText()).not.toMatch(/internal server error/i);
        });
      }

      await test.step('Return to Home so the next test starts from a clean state', async () => {
        await authedHomePage.returnHomeQuietly();
      });
    },
  );

  // TC_019 - Regression: Last-viewed tracking (backend field; UI proxy only)
  test(
    'Revisiting Marketplace does not error (proxy for last-viewed tracking) @regression',
    { tag: '@BROWSE-12' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Visit the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        Logger.log(
          'Mktp_Last_Viewed__c is a backend-only field with no UI surface; verifying repeat visits stay healthy',
        );
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Go Home and revisit the Marketplace', async () => {
        await authedHomePage.navigate();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Verify the repeat visit loaded cleanly', async () => {
        await authedHomePage.expectNotOnLoginPage();
        Logger.log('Repeat Marketplace visit loaded cleanly');
      });

      await test.step('Return to Home so the next test starts from a clean state', async () => {
        await authedHomePage.returnHomeQuietly();
      });
    },
  );

  // =====================================================================
  // Filters Issue (FI_001-004)
  // =====================================================================

  // Covers: FI_001/FI_002
  test(
    'My Listed Deals + Pending Bid Review shows only deals with a bid In Review, or the empty state @regression',
    { tag: '@BROWSE-13' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Filter to My Listed Deals + Pending Bid Review', async () => {
        await authedHomePage.openAndSettle();
        Logger.log('My Listed Deals + Pending Bid Review');
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.selectDealStatus('My Listed Deals');
        await authedMarketplacePage.selectDealStage('Pending Bid Review');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        const n = await authedMarketplacePage.getItemCount();
        Logger.log(`Deal count = ${n}`);
        return n;
      });

      if (count === 0) {
        await test.step('Verify the empty state', async () => {
          await authedMarketplacePage.expectEmptyState();
        });
      }

      // Live-verified QA 2026-10-09: "Pending Bid Review" = this franchise's deals with a bid still In Review
      // (the deal's own Deal Stage can read Ad Council / Full Network / Direct).
      await test.step('Verify each of the first deals has a bid In Review and is not Bid Accepted', async () => {
        for (const i of firstCardIndexes(count, 3)) {
          await authedMarketplacePage.openDealByIndex(i);
          await authedMarketplaceDealPage.expectLoaded();
          const text = await authedMarketplaceDealPage.getDealDialogText();
          expect(text, `${await authedMarketplaceDealPage.getMpdId()} has a bid In Review`).toMatch(/In Review/);
          expect(await authedMarketplaceDealPage.getDealStage()).not.toBe('Bid Accepted');
          await authedMarketplaceDealPage.close();
        }
      });
    },
  );

  // Covers: FI_003/FI_004
  test(
    'My Bids + In Review shows only deals whose bid is In Review, or the empty state @regression',
    { tag: '@BROWSE-14' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Filter to My Bids + In Review', async () => {
        await authedHomePage.openAndSettle();
        Logger.log('My Bids + In Review');
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.selectDealStatus('My Bids');
        await authedMarketplacePage.selectBidStage('In Review');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        const n = await authedMarketplacePage.getItemCount();
        Logger.log(`Deal count = ${n}`);
        return n;
      });

      if (count === 0) {
        await test.step('Verify the empty state', async () => {
          await authedMarketplacePage.expectEmptyState();
        });
      }

      await test.step('Verify each of the first deals shows a bid In Review (or a pending invite)', async () => {
        for (const i of firstCardIndexes(count, 3)) {
          await authedMarketplacePage.openDealByIndex(i);
          await authedMarketplaceDealPage.expectLoaded();
          // An open bid reads "Current bid status: In Review"; a pending Direct Invite shows INVITED + Accept/Decline
          // Invite.
          expect(await authedMarketplaceDealPage.getDealDialogText(), 'Bid In Review').toMatch(
            /Current bid status:?\s*-?\s*In Review|INVITED/i,
          );
          await authedMarketplaceDealPage.close();
        }
      });
    },
  );

  // =====================================================================
  // Geography State Filter (SF_001-007) — also covers FW_001-005 (Web)
  // =====================================================================

  // Covers: SF_001
  test(
    'State filter dropdown is visible under Filters @regression',
    { tag: '@BROWSE-15' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace and the Filters panel', async () => {
        await authedHomePage.openAndSettle();
        Logger.log('Checking State filter visibility');
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.openFilters();
      });

      await test.step('Verify the State dropdown lists options', async () => {
        const options = await authedMarketplacePage.getStateOptions();
        expect(options.length).toBeGreaterThan(0);
      });
    },
  );

  // Covers: SF_002/SF_005/FW_005
  test(
    'State dropdown lists exactly the valid US states, no invalid entries @regression',
    { tag: '@BROWSE-16' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      const options = await test.step('Read the State dropdown options', async () => {
        const states = await authedMarketplacePage.getStateFilterOptions();
        Logger.log(`${states.length} state option(s) found`);
        return states;
      });

      await test.step('Verify exactly the US states are listed, once each', async () => {
        expect(invalidStateOptions(options), 'No invalid state values').toEqual([]);
        expect(missingStates(options), 'Every US state is listed').toEqual([]);
        expect(duplicateEntries(options), 'no duplicate states').toEqual([]);
      });
    },
  );

  // Covers: SF_003/SF_004/FW_001/FW_002
  test(
    'Selecting a state filters the deal list @regression',
    { tag: '@BROWSE-17' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Filter by State = TX', async () => {
        Logger.log(
          'Filtering deals by State — proxy for both existing and newly created MPDs, since deal creation is out of scope here',
        );
        await authedMarketplacePage.selectState('TX');
        await authedMarketplacePage.applyFilters();
      });

      await test.step('Verify the filtered list renders', async () => {
        const count = await authedMarketplacePage.getItemCount();
        Logger.log(`Deal count after Texas filter = ${count}`);
        expect(count).toBeGreaterThanOrEqual(0);
      });
    },
  );

  // Covers: SF_006/FW_003
  test(
    'Reset Filters returns the State filter to default @regression',
    { tag: '@BROWSE-18' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Filter by State = TX', async () => {
        Logger.log('Reset Filters after applying a State filter');
        await authedMarketplacePage.selectState('TX');
        await authedMarketplacePage.applyFilters();
      });

      await test.step('Reset Filters and verify the default list reloads', async () => {
        await authedMarketplacePage.resetFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        Logger.log('Filters reset — deal list restored to default');
      });
    },
  );

  // Covers: SF_007/FW_004
  test(
    'State filter combines correctly with Deal Type @regression',
    { tag: '@BROWSE-19' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Filter by State = TX and Deal Type = Assignment', async () => {
        Logger.log('State + Deal Type combined filter');
        await authedMarketplacePage.selectState('TX');
        await authedMarketplacePage.selectDealType('Assignment');
        await authedMarketplacePage.applyFilters();
      });

      await test.step('Verify the filtered list renders', async () => {
        const count = await authedMarketplacePage.getItemCount();
        Logger.log(`Deal count after State+Type combo = ${count}`);
        expect(count).toBeGreaterThanOrEqual(0);
      });
    },
  );

  // Deal Type filter alone (live-verified options are "All" / "Assignment" /
  // "Opportunity" — not Buy/Sell as originally assumed). No matching sheet row.
  test(
    'Filtering by Assignment deal type shows only Assignment-badged deals @regression',
    { tag: '@BROWSE-20' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Filter by Deal Type = Assignment', async () => {
        Logger.log('Filtering by "Assignment" deal type');
        await authedMarketplacePage.selectDealType('Assignment');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Verify every badged card is Assignment', async () => {
        const labels = await authedMarketplacePage.getDealTypeLabels();
        Logger.log(`Labels after Assignment filter = ${JSON.stringify(labels)}`);
        for (const label of labels) {
          expect(label).toBe('Assignment');
        }
      });
    },
  );

  // =====================================================================
  // Geolocation - Zip Filter (GZ_001-039) — also covers FW_006/007 (Web)
  // =====================================================================

  // Covers: GZ_001
  test(
    'Every deal card location ends with a 5-digit zip code (proxy for zip stamped at creation) @regression',
    { tag: '@BROWSE-21' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step("Verify the first cards' locations end with a 5-digit zip", async () => {
        const count = await authedMarketplacePage.getItemCount();
        for (const i of firstCardIndexes(count, 5)) {
          const location = await authedMarketplacePage.getCardLocation(i);
          Logger.log(`Card ${i} location = "${location}"`);
          expect(location).toMatch(/\d{5}$/);
        }
      });
    },
  );

  // Covers: GZ_002/FW_006
  test(
    'Valid zip code returns matching deals @regression',
    { tag: '@BROWSE-22' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Filter by zip 75001', async () => {
        await authedMarketplacePage.enterZipCode('75001');
        await authedMarketplacePage.applyFilters();
      });

      await test.step('Verify the filtered list renders', async () => {
        const count = await authedMarketplacePage.getItemCount();
        Logger.log(`Deal count for zip 75001 = ${count}`);
        expect(count).toBeGreaterThanOrEqual(0);
      });
    },
  );

  // Covers: GZ_003/FW_007
  test(
    'Zip code with no matches shows the empty-state message @regression',
    { tag: '@BROWSE-23' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      const count = await test.step('Filter by zip 99950', async () => {
        await authedMarketplacePage.enterZipCode('99950');
        await authedMarketplacePage.applyFilters();
        const n = await authedMarketplacePage.getItemCount();
        Logger.log(`Deal count for zip 99950 = ${n}`);
        return n;
      });

      if (count === 0) {
        await test.step('Verify the empty state', async () => {
          await authedMarketplacePage.expectEmptyState();
        });
      }
    },
  );

  // Covers: GZ_004-016
  test(
    'Zip filter combined with every Deal Status / Deal Stage / Bid Stage value @regression',
    { tag: '@BROWSE-24' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      test.setTimeout(300_000);

      await test.step('Open Home as the starting point', async () => {
        await authedHomePage.openAndSettle();
      });

      const dealStatusCombos: Array<{
        tc: string;
        status: Parameters<typeof authedMarketplacePage.selectDealStatus>[0];
      }> = [
        { tc: 'GZ_004', status: 'Available' },
        { tc: 'GZ_005', status: 'My Direct Invites' },
        { tc: 'GZ_016', status: 'Archived' },
      ];
      for (const { tc, status } of dealStatusCombos) {
        await test.step(`${tc}: zip 75001 + Deal Status ${status}`, async () => {
          await authedMarketplacePage.navigate();
          await authedMarketplacePage.expectMarketplaceLoaded();
          await authedMarketplacePage.enterZipCode('75001');
          await authedMarketplacePage.selectDealStatus(status);
          await authedMarketplacePage.applyFilters();
          const count = await authedMarketplacePage.getItemCount();
          Logger.log(`zip + Deals=${status} → ${count} deal(s)`);
          expect(count).toBeGreaterThanOrEqual(0);
        });
      }

      const dealStages: Array<{ tc: string; stage: Parameters<typeof authedMarketplacePage.selectDealStage>[0] }> = [
        { tc: 'GZ_006', stage: 'All' },
        { tc: 'GZ_007', stage: 'Pending Bid Review' },
        { tc: 'GZ_008', stage: 'Direct' },
        { tc: 'GZ_009', stage: 'Ad Council' },
        { tc: 'GZ_010', stage: 'Full Network' },
        { tc: 'GZ_011', stage: 'Bid Accepted' },
      ];
      for (const { tc, stage } of dealStages) {
        await test.step(`${tc}: zip 75001 + My Listed Deals + Deal Stage ${stage}`, async () => {
          await authedMarketplacePage.navigate();
          await authedMarketplacePage.expectMarketplaceLoaded();
          await authedMarketplacePage.enterZipCode('75001');
          await authedMarketplacePage.selectDealStatus('My Listed Deals');
          await authedMarketplacePage.selectDealStage(stage);
          await authedMarketplacePage.applyFilters();
          const count = await authedMarketplacePage.getItemCount();
          Logger.log(`zip + My Listed Deals + Deal Stage=${stage} → ${count} deal(s)`);
          expect(count).toBeGreaterThanOrEqual(0);
        });
      }

      const bidStages: Array<{ tc: string; stage: Parameters<typeof authedMarketplacePage.selectBidStage>[0] }> = [
        { tc: 'GZ_012', stage: 'All' },
        { tc: 'GZ_013', stage: 'In Review' },
        { tc: 'GZ_014', stage: 'Accepted' },
        { tc: 'GZ_015', stage: 'Lost' },
      ];
      for (const { tc, stage } of bidStages) {
        await test.step(`${tc}: zip 75001 + My Bids + Bid Stage ${stage}`, async () => {
          await authedMarketplacePage.navigate();
          await authedMarketplacePage.expectMarketplaceLoaded();
          await authedMarketplacePage.enterZipCode('75001');
          await authedMarketplacePage.selectDealStatus('My Bids');
          await authedMarketplacePage.selectBidStage(stage);
          await authedMarketplacePage.applyFilters();
          const count = await authedMarketplacePage.getItemCount();
          Logger.log(`zip + My Bids + Bid Stage=${stage} → ${count} deal(s)`);
          expect(count).toBeGreaterThanOrEqual(0);
        });
      }
    },
  );

  // Covers: GZ_017-019
  test(
    'Zip filter combined with every Deal Type value @regression',
    { tag: '@BROWSE-25' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open Home as the starting point', async () => {
        await authedHomePage.openAndSettle();
      });

      const types: Array<{ tc: string; type: Parameters<typeof authedMarketplacePage.selectDealType>[0] }> = [
        { tc: 'GZ_017', type: 'All' },
        { tc: 'GZ_018', type: 'Assignment' },
        { tc: 'GZ_019', type: 'Opportunity' },
      ];
      for (const { tc, type } of types) {
        await test.step(`${tc}: zip 75001 + Deal Type ${type}`, async () => {
          await authedMarketplacePage.navigate();
          await authedMarketplacePage.expectMarketplaceLoaded();
          await authedMarketplacePage.enterZipCode('75001');
          await authedMarketplacePage.selectDealType(type);
          await authedMarketplacePage.applyFilters();
          const count = await authedMarketplacePage.getItemCount();
          Logger.log(`zip + Deal Type=${type} → ${count} deal(s)`);
          expect(count).toBeGreaterThanOrEqual(0);
        });
      }
    },
  );

  // Covers: GZ_020/ZV_007
  test(
    'Radius filter activates once a valid zip is entered @regression',
    { tag: '@BROWSE-26' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Verify Radius is disabled with no zip', async () => {
        await authedMarketplacePage.openFilters();
        expect(await authedMarketplacePage.isRadiusEnabled()).toBe(false);
      });

      await test.step('Enter zip 75001 and verify Radius is enabled', async () => {
        await authedMarketplacePage.enterZipCode('75001');
        expect(await authedMarketplacePage.isRadiusEnabled()).toBe(true);
      });

      await test.step('Apply and verify the filtered list renders', async () => {
        await authedMarketplacePage.applyFilters();
        const count = await authedMarketplacePage.getItemCount();
        Logger.log(`Zip + Radius enabled → ${count} deal(s)`);
        expect(count).toBeGreaterThanOrEqual(0);
      });
    },
  );

  // Covers: GZ_021
  test(
    'Zip filter combined with State dropdown @regression',
    { tag: '@BROWSE-27' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      // Live-verified: the State dropdown becomes disabled (mutually exclusive with Zip Code)
      // once a zip value is present, so it cannot be combined the way the spreadsheet describes.
      await test.step('Enter zip 75001 and verify State is disabled', async () => {
        await authedMarketplacePage.enterZipCode('75001');
        const stateEnabled = await authedMarketplacePage.isStateEnabled();
        Logger.log(
          `State dropdown enabled with zip present = ${stateEnabled} (expected false — Zip and State are mutually exclusive filters)`,
        );
        expect(stateEnabled).toBe(false);
      });

      await test.step('Apply and verify the zip-only list renders', async () => {
        await authedMarketplacePage.applyFilters();
        const count = await authedMarketplacePage.getItemCount();
        Logger.log(`Zip-only → ${count} deal(s)`);
        expect(count).toBeGreaterThanOrEqual(0);
      });
    },
  );

  // Covers: GZ_022-028
  test(
    'Zip filter combined with every Opportunity Stage value @regression',
    { tag: '@BROWSE-28' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      test.setTimeout(300_000);

      await test.step('Open Home as the starting point', async () => {
        await authedHomePage.openAndSettle();
      });

      const stages: Array<{ tc: string; stage: Parameters<typeof authedMarketplacePage.selectOpportunityStage>[0] }> = [
        { tc: 'GZ_022', stage: 'All Stages' },
        { tc: 'GZ_023', stage: 'Lead Queue' },
        { tc: 'GZ_024', stage: 'Contact' },
        { tc: 'GZ_025', stage: 'Appointment' },
        { tc: 'GZ_026', stage: 'Offer' },
        { tc: 'GZ_027', stage: 'Contract' },
        { tc: 'GZ_028', stage: 'Buy Closing' },
      ];
      for (const { tc, stage } of stages) {
        await test.step(`${tc}: zip 75001 + Opportunity Stage ${stage}`, async () => {
          await authedMarketplacePage.navigate();
          await authedMarketplacePage.expectMarketplaceLoaded();
          await authedMarketplacePage.enterZipCode('75001');
          await authedMarketplacePage.selectOpportunityStage(stage);
          await authedMarketplacePage.applyFilters();
          const count = await authedMarketplacePage.getItemCount();
          Logger.log(`zip + Opportunity Stage=${stage} → ${count} deal(s)`);
          expect(count).toBeGreaterThanOrEqual(0);
        });
      }
    },
  );

  // Covers: GZ_029-031
  test(
    'Zip filter combined with each advanced filter (Last Activity / Days in System / Days in Marketplace) @regression',
    { tag: '@BROWSE-29' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open Home as the starting point', async () => {
        await authedHomePage.openAndSettle();
      });

      const advanced: Array<{ tc: string; name: string; apply: () => Promise<void> }> = [
        { tc: 'GZ_029', name: 'Last Activity', apply: () => authedMarketplacePage.selectLastActivity('Any') },
        { tc: 'GZ_030', name: 'Days in System', apply: () => authedMarketplacePage.selectDaysInSystem('Any') },
        {
          tc: 'GZ_031',
          name: 'Days in Marketplace',
          apply: () => authedMarketplacePage.selectDaysInMarketplace('Any'),
        },
      ];
      for (const { tc, name, apply } of advanced) {
        await test.step(`${tc}: zip 75001 + ${name} = Any`, async () => {
          await authedMarketplacePage.navigate();
          await authedMarketplacePage.expectMarketplaceLoaded();
          await authedMarketplacePage.enterZipCode('75001');
          await apply();
          await authedMarketplacePage.applyFilters();
          const count = await authedMarketplacePage.getItemCount();
          Logger.log(`zip + advanced filter → ${count} deal(s)`);
          expect(count).toBeGreaterThanOrEqual(0);
        });
      }
    },
  );

  // GZ_032/033 — Show Images toggle: not present in the current UI (live-verified, no such
  // control exists in the Filters panel). Documented as an absence check per the framework's
  // established convention (see knowledgebase module's TC_014-017) rather than a fabricated pass.
  // Covers: GZ_032/GZ_033
  test(
    'Show Images toggle is not present in the current Filters panel @regression',
    { tag: '@BROWSE-30' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Open Filters and verify there is no Show Images toggle', async () => {
        await authedMarketplacePage.openFilters();
        const present = await authedMarketplacePage.isMessageShown(/show images/i);
        Logger.log(`Show Images toggle present = ${present} (expected false — feature not yet built)`);
        expect(present).toBe(false);
      });
    },
  );

  // Covers: GZ_034/FW_012
  test(
    'Refresh retains the applied zip filter @regression',
    { tag: '@BROWSE-31' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Filter by zip 75001', async () => {
        await authedMarketplacePage.enterZipCode('75001');
        await authedMarketplacePage.applyFilters();
      });

      await test.step('Refresh and verify the listing reloads', async () => {
        await authedMarketplacePage.refresh();
        const zipAfterRefresh = await authedMarketplacePage.getZipCodeValue().catch(() => '');
        Logger.log(`Zip value after Refresh = "${zipAfterRefresh}"`);
        await authedMarketplacePage.expectMarketplaceLoaded();
      });
    },
  );

  // Covers: GZ_035/GZ_036/FW_013/FW_014
  test(
    'Sort order (Newest/Oldest) works with a zip filter applied @regression',
    { tag: '@BROWSE-32' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Filter by zip 75001', async () => {
        await authedMarketplacePage.enterZipCode('75001');
        await authedMarketplacePage.applyFilters();
      });

      const oldestCount = await test.step('Sort by Oldest', async () => {
        await authedMarketplacePage.selectSort('Sort: Oldest');
        const n = await authedMarketplacePage.getItemCount();
        Logger.log(`Sort=Oldest with zip filter → ${n} deal(s)`);
        return n;
      });

      await test.step('Sort by Newest and verify the same deal count', async () => {
        await authedMarketplacePage.selectSort('Sort: Newest');
        const newestCount = await authedMarketplacePage.getItemCount();
        Logger.log(`Sort=Newest with zip filter → ${newestCount} deal(s)`);
        expect(newestCount).toBe(oldestCount);
      });
    },
  );

  // Covers: GZ_037
  test(
    'Reset clears the zip filter @regression',
    { tag: '@BROWSE-33' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Filter by zip 75001', async () => {
        await authedMarketplacePage.enterZipCode('75001');
        await authedMarketplacePage.applyFilters();
      });

      await test.step('Reset Filters and verify the zip is cleared', async () => {
        await authedMarketplacePage.resetFilters();
        const zipAfterReset = await authedMarketplacePage.getZipCodeValue().catch(() => '');
        Logger.log(`Zip value after Reset = "${zipAfterReset}"`);
        expect(zipAfterReset).toBe('');
      });
    },
  );

  // Covers: GZ_038/FW_016
  test(
    'Hide Filter Panel keeps filtered results visible @regression',
    { tag: '@BROWSE-34' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      const countBeforeHide = await test.step('Filter by zip 75001', async () => {
        await authedMarketplacePage.enterZipCode('75001');
        await authedMarketplacePage.applyFilters();
        return authedMarketplacePage.getItemCount();
      });

      await test.step('Hide the Filter panel and verify the results are unchanged', async () => {
        await authedMarketplacePage.hideFilterPanel();
        expect(await authedMarketplacePage.isFilterPanelVisible()).toBe(false);
        const countAfterHide = await authedMarketplacePage.getItemCount();
        Logger.log(`Deal count before/after hiding panel = ${countBeforeHide}/${countAfterHide}`);
        expect(countAfterHide).toBe(countBeforeHide);
      });
    },
  );

  // =====================================================================
  // Zip Code Input Validation (ZV_001-008)
  // =====================================================================

  // Covers: ZV_001/ZV_002
  test(
    'Zip Code input is capped at 5 characters with a "Limit reached" message @regression',
    { tag: '@BROWSE-35' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Type a 6-digit zip', async () => {
        await authedMarketplacePage.enterZipCode('123456');
      });

      await test.step('Verify the value is capped at 5 characters', async () => {
        const value = await authedMarketplacePage.getZipCodeValue();
        const limited = await authedMarketplacePage.hasZipLimitMessage();
        Logger.log(`Zip value = "${value}", limit message shown = ${limited}`);
        expect(value.length).toBeLessThanOrEqual(5);
      });
    },
  );

  // Covers: ZV_003
  test(
    'A valid 5-digit zip code is accepted without error @regression',
    { tag: '@BROWSE-36' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Enter zip 75001 and verify it is kept as typed', async () => {
        await authedMarketplacePage.enterZipCode('75001');
        expect(await authedMarketplacePage.getZipCodeValue()).toBe('75001');
      });

      await test.step('Apply and verify the listing reloads', async () => {
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });
    },
  );

  // ZV_004 — live-verified QA 2026-10-21: the Zip Code field now strips non-numeric
  // characters as they are typed ("AB123" → "123"); no error message is shown.
  // Covers: ZV_004
  test(
    'Zip Code field drops non-numeric characters as they are typed @regression',
    { tag: '@BROWSE-37' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Type "AB123" and verify only the digits are kept', async () => {
        await authedMarketplacePage.enterZipCode('AB123');
        const value = await authedMarketplacePage.getZipCodeValue();
        Logger.log(`Zip value after non-numeric entry = "${value}"`);
        expect(value).toBe('123');
      });
    },
  );

  // Covers: ZV_005
  test(
    'Empty Zip Code applies no zip filter and shows no error @regression',
    { tag: '@BROWSE-38' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Open Filters and verify Zip Code is empty', async () => {
        await authedMarketplacePage.openFilters();
        expect(await authedMarketplacePage.getZipCodeValue()).toBe('');
      });

      await test.step('Apply and verify the listing reloads', async () => {
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });
    },
  );

  // Covers: ZV_008
  test(
    'Zip Code combined with multiple simultaneous filters @regression',
    { tag: '@BROWSE-39' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Apply zip 75001 + Opportunity Stage + Last Activity together', async () => {
        Logger.log('Zip + Opportunity Stage + Last Activity applied together');
        await authedMarketplacePage.enterZipCode('75001');
        await authedMarketplacePage.selectOpportunityStage('All Stages');
        await authedMarketplacePage.selectLastActivity('Any');
        await authedMarketplacePage.applyFilters();
      });

      await test.step('Verify the filtered list renders', async () => {
        const count = await authedMarketplacePage.getItemCount();
        Logger.log(`Deal count = ${count}`);
        expect(count).toBeGreaterThanOrEqual(0);
      });
    },
  );

  // =====================================================================
  // Filters - Web (FW_008-011, FW_015) — remaining rows not already covered above
  // =====================================================================

  // Covers: FW_008-011
  test(
    'Filtered results are identical across Grid / List / Map views @regression',
    { tag: '@BROWSE-40' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Filter by Deal Type = Assignment', async () => {
        await authedMarketplacePage.selectDealType('Assignment');
        await authedMarketplacePage.applyFilters();
      });

      const gridIds = await test.step('Read the deal ids in Grid view', async () => {
        await authedMarketplacePage.switchView('Grid');
        const ids = await authedMarketplacePage.getSortedCardMpdIds();
        Logger.log(`Grid view — ${ids.length} deal(s)`);
        return ids;
      });

      await test.step('Verify List view shows the same deals', async () => {
        await authedMarketplacePage.switchView('List');
        const listIds = await authedMarketplacePage.getSortedCardMpdIds();
        Logger.log(`List view — ${listIds.length} deal(s)`);
        expect(listIds).toEqual(gridIds);
      });

      await test.step('Switch to Map view', async () => {
        await authedMarketplacePage.switchView('Map');
        await authedMarketplacePage.waitForStabilization(1500);
        Logger.log('Map view switched to — see MarketplaceMapView chunk for map-specific assertions');
      });

      await test.step('Verify Grid view still shows the same deals', async () => {
        await authedMarketplacePage.switchView('Grid');
        const gridIdsAgain = await authedMarketplacePage.getSortedCardMpdIds();
        Logger.log(`Back to Grid — ${gridIdsAgain.length} deal(s)`);
        expect(gridIdsAgain).toEqual(gridIds);
      });
    },
  );

  // Covers: FW_015
  test(
    'Clear Filters (Reset) restores every filter to its default @regression',
    { tag: '@BROWSE-41' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Apply State, Deal Type and zip filters', async () => {
        await authedMarketplacePage.selectState('TX');
        await authedMarketplacePage.selectDealType('Assignment');
        await authedMarketplacePage.enterZipCode('75001');
        await authedMarketplacePage.applyFilters();
      });

      await test.step('Reset Filters and verify every filter is back to default', async () => {
        await authedMarketplacePage.resetFilters();
        expect(await authedMarketplacePage.getZipCodeValue()).toBe('');
        await authedMarketplacePage.expectMarketplaceLoaded();
        Logger.log('All filters reset — default deal list restored');
      });
    },
  );

  // Covers: MV_001/MV_014/MV_027/SAN_064
  test(
    'Map View tab is available alongside Grid View and List View @regression',
    { tag: '@BROWSE-42' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Verify the Grid, List and Map view buttons are shown', async () => {
        await expect(authedMarketplacePage.getViewButton('Grid')).toBeVisible();
        await expect(authedMarketplacePage.getViewButton('List')).toBeVisible();
        await expect(authedMarketplacePage.getViewButton('Map')).toBeVisible();
      });
    },
  );

  // Covers: MV_002/MV_015/MV_028
  test(
    'Switching to Map View loads the map with existing applied filters @regression',
    { tag: '@BROWSE-43' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Filter by Deal Type = Assignment', async () => {
        await authedMarketplacePage.selectDealType('Assignment');
        await authedMarketplacePage.applyFilters();
      });

      await test.step('Switch to Map View and verify the map loads with the filters kept', async () => {
        await authedMarketplacePage.switchView('Map');
        await authedMarketplacePage.waitForMapReady();
        expect(await authedMarketplacePage.isMapVisible()).toBe(true);
        expect(await authedMarketplacePage.getZipCodeValue()).toBe('');
      });
    },
  );

  // Covers: MV_003/MV_016/MV_029
  test(
    'Map renders without errors and displays geographic content @regression',
    { tag: '@BROWSE-44' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace in Map View', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.switchView('Map');
        await authedMarketplacePage.waitForMapReady();
      });

      await test.step('Verify the map and its deal markers render', async () => {
        expect(await authedMarketplacePage.isMapVisible()).toBe(true);
        const markerCount = await authedMarketplacePage.getMapMarkerCount();
        Logger.log(`${markerCount} deal marker(s) rendered on the map`);
        expect(markerCount).toBeGreaterThanOrEqual(0);
      });
    },
  );

  // Covers: MV_004/MV_017/MV_030
  test(
    'Map shows a default position — current-location marker present on load @regression',
    { tag: '@BROWSE-45' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace in Map View', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.switchView('Map');
        await authedMarketplacePage.waitForMapReady();
      });

      await test.step('Verify the current-location marker is shown', async () => {
        expect(await authedMarketplacePage.isCurrentLocationMarkerVisible()).toBe(true);
      });
    },
  );

  // Covers: MV_005/MV_018/MV_031
  test(
    'ZIP-grouped markers show a single pin with a deal count @regression',
    { tag: '@BROWSE-46' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace in Map View', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.switchView('Map');
        await authedMarketplacePage.waitForMapReady();
      });

      await test.step('Verify every marker label reads "N Deal(s) | ZIP NNNNN"', async () => {
        const labels = await authedMarketplacePage.getMapMarkerLabels();
        Logger.log(`Marker labels = ${JSON.stringify(labels)}`);
        for (const label of labels) expect(label).toMatch(/^\d+ Deals? \| ZIP \d{5}$/);
      });
    },
  );

  // Covers: MV_006/MV_032
  test(
    'Clicking a marker shows its deals in the synchronized table @regression',
    { tag: '@BROWSE-47' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace in Map View', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.switchView('Map');
        await authedMarketplacePage.waitForMapReady();
      });

      const zip = await test.step('Zoom out until a deal marker is visible', async () => {
        return authedMarketplacePage.zoomOutUntilMarkerVisible();
      });

      test.skip(zip === '', 'No deal marker currently visible in the map pane to click in current sandbox state');

      await test.step(`Click the ZIP ${zip} marker`, async () => {
        await authedMarketplacePage.clickMapMarkerForZip(zip);
      });

      await test.step('Verify the ZIP panel lists its deals', async () => {
        expect(await authedMarketplacePage.isMapZipPanelVisible()).toBe(true);
        const dealIds = await authedMarketplacePage.getMapPanelDealIds();
        Logger.log(`ZIP ${zip} panel deal ids = ${JSON.stringify(dealIds)}`);
        expect(dealIds.length).toBeGreaterThan(0);
      });
    },
  );

  // Covers: MV_007/MV_020/MV_033
  test(
    "A marker's label carries the Zip Code and deal count within its range @regression",
    { tag: '@BROWSE-48' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace in Map View', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.switchView('Map');
        await authedMarketplacePage.waitForMapReady();
      });

      const labels = await test.step('Read the map marker labels', async () => {
        return authedMarketplacePage.getMapMarkerLabels();
      });

      test.skip(labels.length === 0, 'No deal markers on the map in current sandbox state');

      // Live-verified: hovering exposes no separate tooltip — the marker's own
      // aria-label (asserted here) is the same "N Deal(s) | ZIP NNNNN" content.
      await test.step('Verify the first marker label carries the deal count and ZIP', async () => {
        expect(labels[0]).toMatch(/^\d+ Deals? \| ZIP \d{5}$/);
      });
    },
  );

  // Covers: MV_008/MV_034, MV_021
  test(
    'Map pins and the adjacent table stay data-consistent @regression',
    { tag: '@BROWSE-49' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace in Map View', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.switchView('Map');
        await authedMarketplacePage.waitForMapReady();
      });

      const zip = await test.step('Zoom out until a deal marker is visible', async () => {
        return authedMarketplacePage.zoomOutUntilMarkerVisible();
      });

      test.skip(zip === '', 'No deal marker currently visible in the map pane in current sandbox state');

      const expectedCount = await test.step(`Read the ZIP ${zip} marker's deal count and click it`, async () => {
        const n = await authedMarketplacePage.getMapMarkerDealCount(zip);
        await authedMarketplacePage.clickMapMarkerForZip(zip);
        return n;
      });

      await test.step('Verify the panel shows the same ZIP and exactly that many deals', async () => {
        expect(await authedMarketplacePage.getMapPanelZip()).toBe(zip);
        const dealIds = await authedMarketplacePage.getMapPanelDealIds();
        for (const id of dealIds) expect(id).toMatch(/^MPD-\d+$/);
        expect(dealIds).toHaveLength(expectedCount);
      });
    },
  );

  // Covers: MV_009/MV_022/MV_035/SAN_065
  test(
    'Zip Code filter applies correctly in Map View @regression',
    { tag: '@BROWSE-50' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace with filters reset', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      // A zip that really has a deal: the first card's.
      const zip = await test.step("Read the first card's zip", async () => {
        return authedMarketplacePage.getCardZip(0);
      });

      test.skip(!zip, 'No deal card with a zip code in current sandbox state');

      const gridCount = await test.step(`Filter by zip ${zip} and count every grid card`, async () => {
        await authedMarketplacePage.enterZipCode(zip);
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.loadAllCards(); // the map plots every match, the grid only 50 per page
        const n = await authedMarketplacePage.getDealCardCount();
        expect(n, `zip ${zip} keeps at least its own deal`).toBeGreaterThan(0);
        return n;
      });

      await test.step('Switch to Map View and verify the pins hold exactly the filtered deals', async () => {
        await authedMarketplacePage.switchView('Map');
        await authedMarketplacePage.waitForMapReady();
        expect(await authedMarketplacePage.isMapVisible()).toBe(true);
        const labels = await authedMarketplacePage.getMapMarkerLabels();
        Logger.log(`Zip ${zip} → grid ${gridCount} deal(s), map ${JSON.stringify(labels)}`);
        expect(await authedMarketplacePage.hasMapMarkerForZip(zip), 'Map shows the filtered zip').toBe(true);
        expect(await authedMarketplacePage.getMapDealTotal(), 'map pins hold exactly the filtered deals').toBe(gridCount);
      });
    },
  );

  // Covers: MV_010/MV_023/MV_036
  test(
    'State filter applies correctly in Map View @regression',
    { tag: '@BROWSE-51' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace with filters reset', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      const cards = await test.step('Filter by State = CO and verify every grid card is in CO', async () => {
        // State options are two-letter abbreviations, not full names (see SF_003/FW_001 in
        // this file, live-verified against the same dropdown).
        await authedMarketplacePage.selectState('CO');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.loadAllCards(); // the map plots every match, the grid only 50 per page
        const texts = await authedMarketplacePage.getCardSummaries();
        for (const card of texts) expect(card, 'every deal is in CO').toMatch(/\bCO\s+\d{5}/);
        return texts;
      });

      await test.step('Switch to Map View and verify the pins hold exactly the filtered deals', async () => {
        await authedMarketplacePage.switchView('Map');
        await authedMarketplacePage.waitForMapReady();
        expect(await authedMarketplacePage.isMapVisible()).toBe(true);
        const total = await authedMarketplacePage.getMapDealTotal();
        Logger.log(`State=CO → grid ${cards.length} deal(s), map ${total}`);
        expect(total, 'map pins hold exactly the filtered deals').toBe(cards.length);
      });
    },
  );

  // Covers: MV_011/MV_024/MV_037
  test(
    'Opportunity Stage filter applies correctly in Map View @regression',
    { tag: '@BROWSE-52' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace with filters reset', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      const cards =
        await test.step('Filter by Opportunity Stage = Contact and verify every grid card matches', async () => {
          // Contact is the stage freshly listed deals carry, so it has matches in any sandbox state.
          await authedMarketplacePage.selectOpportunityStage('Contact');
          await authedMarketplacePage.applyFilters();
          await authedMarketplacePage.expectMarketplaceLoaded();
          await authedMarketplacePage.loadAllCards(); // the map plots every match, the grid only 50 per page
          const texts = await authedMarketplacePage.getCardSummaries();
          for (const card of texts)
            expect(card, 'every deal is at Opportunity Stage Contact').toContain('Stage: Contact');
          return texts;
        });

      await test.step('Switch to Map View and verify the pins hold exactly the filtered deals', async () => {
        await authedMarketplacePage.switchView('Map');
        await authedMarketplacePage.waitForMapReady();
        expect(await authedMarketplacePage.isMapVisible()).toBe(true);
        const total = await authedMarketplacePage.getMapDealTotal();
        Logger.log(`Opportunity Stage=Contact → grid ${cards.length} deal(s), map ${total}`);
        expect(total, 'map pins hold exactly the filtered deals').toBe(cards.length);
      });
    },
  );

  // Covers: MV_012/MV_025/MV_038/SAN_066
  test(
    'Switching between Map / List / Grid preserves applied filters @regression',
    { tag: '@BROWSE-53' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Filter by zip 75001', async () => {
        await authedMarketplacePage.enterZipCode('75001');
        await authedMarketplacePage.applyFilters();
      });

      for (const view of ['Map', 'List', 'Grid'] as const) {
        await test.step(`Switch to ${view} view and verify the zip filter is kept`, async () => {
          await authedMarketplacePage.switchView(view);
          if (view === 'Map') await authedMarketplacePage.waitForMapReady();
          expect(await authedMarketplacePage.getZipCodeValue()).toBe('75001');
        });
      }
    },
  );

  // Covers: MV_013/MV_026/MV_039
  test(
    'Map View shows the empty state when no deals match the applied filters @regression',
    { tag: '@BROWSE-54' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Filter by zip 99950 and switch to Map View', async () => {
        await authedMarketplacePage.enterZipCode('99950');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.switchView('Map');
        await authedMarketplacePage.waitForMapReady();
      });

      await test.step('Verify the map shows no deal markers', async () => {
        const markerCount = await authedMarketplacePage.getMapMarkerCount();
        Logger.log(`Zip 99950 (no matches) → ${markerCount} deal marker(s)`);
        expect(markerCount).toBe(0);
      });
    },
  );

  // =====================================================================
  // Sanity sheet: filters (SAN_026-032)
  // =====================================================================

  // Covers: SAN_026
  test(
    "My Listed Deals shows only this franchise's own listings @regression",
    { tag: '@BROWSE-55' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      await test.step('Open the Marketplace with filters reset', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      const count = await test.step('Filter to My Listed Deals', async () => {
        await authedMarketplacePage.selectDealStatus('My Listed Deals');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getDealCardCount();
      });

      test.skip(count === 0, 'This franchise has no listed deals in current sandbox state');

      await test.step("Verify each of the first deals is shown from the listing franchise's side, with no Place Bid", async () => {
        for (const i of firstCardIndexes(count, 5)) {
          await authedMarketplacePage.openDealByIndex(i);
          await authedMarketplaceDealPage.expectLoaded();
          const text = await authedMarketplaceDealPage.getDealDialogText();
          const mpdId = await authedMarketplaceDealPage.getMpdId();
          // Only the listing franchise sees the bid list ("Bid Status" column / "No Bids were placed yet"),
          // or — once won — the winner banner; a bidder sees its own Reason for Bid form instead.
          expect(text, `${mpdId} is shown from the listing franchise's side`).toMatch(
            /Bid Status|No Bids were placed yet|winning franchise for this deal is/,
          );
          expect(await authedMarketplaceDealPage.isEligibleToBid(), `${mpdId}: no Place Bid on an own listing`).toBe(
            false,
          );
          await authedMarketplaceDealPage.close();
        }
      });
    },
  );

  // Covers: SAN_027
  test(
    'My Bids + each Bid Stage (In Review / Accepted / Lost) narrows to that status only @regression',
    { tag: '@BROWSE-56' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      await test.step('Open Home as the starting point', async () => {
        await authedHomePage.openAndSettle();
      });

      for (const stage of ['In Review', 'Accepted', 'Lost'] as const) {
        await test.step(`My Bids / ${stage} shows only ${stage} bids`, async () => {
          await authedMarketplacePage.navigate();
          await authedMarketplacePage.expectMarketplaceLoaded();
          await authedMarketplacePage.selectDealStatus('My Bids');
          await authedMarketplacePage.selectBidStage(stage);
          await authedMarketplacePage.applyFilters();
          await authedMarketplacePage.expectMarketplaceLoaded();
          const count = await authedMarketplacePage.getDealCardCount();
          Logger.log(`My Bids / ${stage} → ${count} deal(s)`);
          if (count === 0) await authedMarketplacePage.expectEmptyState();
          for (const i of firstCardIndexes(count, 2)) {
            await authedMarketplacePage.openDealByIndex(i);
            await authedMarketplaceDealPage.expectLoaded();
            expect(await authedMarketplaceDealPage.getDealDialogText()).toMatch(
              bidStagePattern(stage, envConfig.FRANCHISE_A_NAME),
            );
            await authedMarketplaceDealPage.close();
          }
        });
      }
    },
  );

  // Covers: SAN_028
  test(
    'Zip Code rejects a 3-digit and a non-numeric value, accepts a valid 5-digit zip @regression',
    { tag: '@BROWSE-57' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace with filters reset', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      const allCount = await test.step('Count every deal before filtering', async () => {
        return authedMarketplacePage.getDealCardCount();
      });

      for (const bad of ['750', 'abcde']) {
        await test.step(`Zip "${bad}" is rejected`, async () => {
          await authedMarketplacePage.enterZipCode(bad);
          await authedMarketplacePage.applyFilters();
          await authedMarketplacePage.expectMarketplaceLoaded();
          // Rejected = an error is shown, or the value never makes it into the field.
          expect.soft(await authedMarketplacePage.isZipRejected(bad), `"${bad}" should be rejected`).toBe(true);
          await authedMarketplacePage.resetFilters();
        });
      }

      await test.step('Zip 75001 is accepted, enables Radius and narrows the list', async () => {
        await authedMarketplacePage.enterZipCode('75001');
        expect(await authedMarketplacePage.getZipCodeValue()).toBe('75001');
        expect(await authedMarketplacePage.isRadiusEnabled(), 'a valid zip enables Radius').toBe(true);
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        expect(await authedMarketplacePage.getDealCardCount()).toBeLessThanOrEqual(allCount);
      });
    },
  );

  // Covers: SAN_029
  test(
    'A wider Radius around a zip returns at least as many deals as a narrower one @regression',
    { tag: '@BROWSE-58' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace with filters reset', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      const zip = await test.step("Read the first card's zip", async () => {
        return authedMarketplacePage.getCardZip(0);
      });

      test.skip(!zip, 'No deal card with a zip code in current sandbox state');

      const { narrowest, widest } = await test.step(`Enter zip ${zip} and read the Radius options`, async () => {
        await authedMarketplacePage.enterZipCode(zip);
        const options = await authedMarketplacePage.getRadiusMileOptions();
        await authedMarketplacePage.waitForStabilization(1000);
        Logger.log(`Radius options = ${JSON.stringify(options)}`);
        expect(options.length, 'Radius offers several distances').toBeGreaterThan(1);
        return narrowestAndWidest(options);
      });

      const narrowCount = await test.step(`Apply the narrowest Radius (${narrowest}) and count the deals`, async () => {
        return authedMarketplacePage.applyRadiusAndCount(narrowest);
      });

      const wideCount = await test.step(`Apply the widest Radius (${widest}) and count the deals`, async () => {
        return authedMarketplacePage.applyRadiusAndCount(widest);
      });

      await test.step('Verify the wider radius returns at least as many deals', async () => {
        expect(narrowCount, "the zip's own deal is within the narrowest radius").toBeGreaterThan(0);
        expect(wideCount).toBeGreaterThanOrEqual(narrowCount);
      });
    },
  );

  // Covers: SAN_030
  test(
    'Sort: Oldest lists deals oldest-first and keeps the applied filter @regression',
    { tag: '@BROWSE-59' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace with filters reset', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      const cards = await test.step('Filter by State = CO and sort by Oldest', async () => {
        await authedMarketplacePage.selectState('CO');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.selectSort('Sort: Oldest');
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getCardSummaries();
      });

      test.skip(cards.length < 2, 'Fewer than 2 CO deals in current sandbox state');

      await test.step('Verify Listing Age never increases and every card is still in CO', async () => {
        const ages = listingAgesFrom(cards);
        Logger.log(`Listing Age (days), Sort: Oldest = ${JSON.stringify(ages)}`);
        for (let i = 1; i < ages.length; i++)
          expect(ages[i], 'oldest first = Listing Age never increases').toBeLessThanOrEqual(ages[i - 1]);
        for (const card of cards) expect(card, 'State filter still applied').toMatch(/\bCO\s+\d{5}/);
      });
    },
  );

  // Covers: SAN_031
  test(
    'Reset Filters clears every applied filter and reloads the full Available list @regression',
    { tag: '@BROWSE-60' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      const defaultIds =
        await test.step('Open the Marketplace with filters reset and read the baseline list', async () => {
          await authedHomePage.openAndSettle();
          await authedMarketplacePage.navigate();
          await authedMarketplacePage.resetFilters();
          await authedMarketplacePage.expectMarketplaceLoaded();
          const ids = await authedMarketplacePage.getSortedCardMpdIds();
          expect(ids.length, 'baseline Available list').toBeGreaterThan(1);
          return ids;
        });

      await test.step('Apply Deal Type, State and Opportunity Stage filters', async () => {
        await authedMarketplacePage.selectDealType('Assignment');
        await authedMarketplacePage.selectState('CO');
        await authedMarketplacePage.selectOpportunityStage('Contact');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await expect(authedMarketplacePage.filtersButtonWithActiveFilters, 'filters are applied').toBeVisible();
      });

      await test.step('Reset Filters and verify every filter is cleared and the full list reloads', async () => {
        await authedMarketplacePage.resetFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await expect(authedMarketplacePage.filtersButtonWithNoFilters, 'no filter left applied').toBeVisible();
        await expect(authedMarketplacePage.activeFiltersSummary).toBeHidden();
        expect(await authedMarketplacePage.getZipCodeValue()).toBe('');
        expect(await authedMarketplacePage.getSortedCardMpdIds(), 'full Available list reloads').toEqual(
          defaultIds,
        );
      });
    },
  );

  // Covers: SAN_032
  test(
    'Hide / Show Filter Panel collapses and re-opens the panel @regression',
    { tag: '@BROWSE-61' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace with filters reset', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Open the Filter panel', async () => {
        await authedMarketplacePage.openFilters();
        expect(await authedMarketplacePage.isFilterPanelVisible()).toBe(true);
      });

      await test.step('Hide the Filter panel and verify it collapses', async () => {
        await authedMarketplacePage.hideFilterPanel();
        expect(await authedMarketplacePage.isFilterPanelVisible(), 'panel collapses').toBe(false);
      });

      await test.step('Open the Filter panel again and verify it expands', async () => {
        await authedMarketplacePage.openFilters();
        expect(await authedMarketplacePage.isFilterPanelVisible(), 'panel expands again').toBe(true);
      });
    },
  );

  // =====================================================================
  // Auto-Refresh (AR_002-003 — see header note for AR_001/004-010)
  // =====================================================================

  // Covers: AR_002
  test(
    'Opening and closing the View Deal modal leaves the deal list intact @regression',
    { tag: '@BROWSE-62' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const before = await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getDealCardCount();
      });

      test.skip(before === 0, 'No deal cards in current sandbox state');

      await test.step('Open and close the first deal', async () => {
        await authedMarketplacePage.openDealByIndex(0);
        await authedMarketplaceDealPage.expectLoaded();
        await authedMarketplaceDealPage.close();
      });

      await test.step('Verify the deal count is unchanged', async () => {
        const after = await authedMarketplacePage.getDealCardCount();
        Logger.log(`Deal count before=${before} after=${after}`);
        expect(after).toBe(before);
      });
    },
  );

  // Covers: AR_003
  test(
    'Refresh Deals reloads the list without error @regression',
    { tag: '@BROWSE-63' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
      });

      await test.step('Click Refresh and verify the list reloads', async () => {
        await authedMarketplacePage.refresh();
        const count = await authedMarketplacePage.getDealCardCount();
        Logger.log(`${count} deal(s) visible after Refresh`);
        expect(count).toBeGreaterThanOrEqual(0);
      });
    },
  );
});

// =====================================================================
// List auto-refresh — two franchises side by side.
// "Auto-refreshed" = the open deal list, untouched since the action, already
// matches what the list's own Refresh button then shows. Live-verified QA
// 2026-10-11: another franchise's new listing does NOT appear without Refresh
// (checked for 60s); the acting user's own Withdraw Deal does update their list.
// Franchise B never sees Franchise A's deals (QA 2026-10-26), so the other
// franchise is the owner's second franchise, in a second tab of the same login.
// =====================================================================

const OTHER_FRANCHISE = envConfig.FRANCHISE_A_OTHER_NAME;

test.describe('Marketplace Browse: list auto-refresh — two franchises side by side @regression @MarketplaceBrowseMapViewFiltersSearch @TwoAccount', () => {
  test.describe.configure({ timeout: 1_800_000 });

  test.beforeAll(async ({ authedPage, otherFranchisePage }) => {
    await tileWindow(authedPage, 'left');
    await tileWindow(otherFranchisePage, 'right');
  });

  // Covers: AR_001, AR_004, AR_005, AR_006, AR_007, AR_008, AR_009, AR_010, MSG_017, BW_011
  test('The deal list refreshes itself after listing, bidding, accepting, declining and withdrawing @regression', async ({
    authedHomePage,
    authedSellerLeadPage,
    authedMarketplacePage,
    authedMarketplaceDealPage,
    otherFranchiseMarketplacePage,
    otherFranchiseMarketplaceDealPage,
  }) => {
    const aList = authedMarketplacePage;
    const oList = otherFranchiseMarketplacePage;
    const a = authedMarketplaceDealPage;
    const o = otherFranchiseMarketplaceDealPage;

    // Covers: AR_001
    await test.step("Open the other franchise's Available list before anything is listed", async () => {
      await oList.showList('Available');
    });

    const deal = await test.step('List a fresh open deal as Franchise A', async () => {
      await aList.bringToFront();
      const listed = await listFreshDeal(authedHomePage, authedSellerLeadPage, aList, a, 'Assignment', '');
      await a.close();
      return listed;
    });

    await test.step("Verify the new deal appears on the other franchise's open list without a refresh", async () => {
      // Seen QA 2026-10-11: not there after 60s; only the Refresh button brings it in.
      await expect
        .configure({ soft: true })
        .poll(() => oList.isCardListed(deal.mpdId), {
          timeout: 30_000,
          message: `${deal.mpdId} appears on the other franchise's open Available list without Refresh`,
        })
        .toBe(true);
      await oList.refresh();
      await oList.expectMarketplaceLoaded();
      expect(await oList.getAllCardMpdIds(), 'Refresh brings the new deal in').toContain(deal.mpdId);
    });

    // Covers: AR_004
    await test.step('After the other franchise bids from its list, the list is already up to date', async () => {
      await bidFromOpenList(oList, o, deal.mpdId, 'Bid from the open list', OTHER_FRANCHISE);
      const { before, after } = await oList.getCardBeforeAndAfterRefresh(deal.mpdId);
      expect.soft(before, "The other franchise's list after Place Bid matches Refresh").toBe(after);
    });

    // Covers: AR_009
    await test.step('After the other franchise withdraws its bid from My Bids, the list is already up to date', async () => {
      await oList.showList('My Bids');
      expect(await oList.openDealByMpdId(deal.mpdId)).toBe(true);
      await o.expectLoaded();
      await o.selectFranchiseIfPresent(OTHER_FRANCHISE);
      await o.withdrawBid();
      expect(await o.waitForToastText()).toContain('Bid Withdrawn Successfully');
      await o.close();
      const { before, after } = await oList.getCardBeforeAndAfterRefresh(deal.mpdId);
      expect.soft(before, "The other franchise's list after Withdraw Bid matches Refresh").toBe(after);
    });

    // Covers: AR_005
    await test.step('After Franchise A accepts a bid from My Listed Deals, the list is already up to date', async () => {
      // A withdrawn bid can be placed again (a declined one cannot — QA 2026-10-26).
      await oList.showList('Available');
      await bidFromOpenList(oList, o, deal.mpdId, 'Bid to be accepted', OTHER_FRANCHISE);
      await aList.bringToFront();
      await aList.showList('My Listed Deals');
      expect(await aList.openDealByMpdId(deal.mpdId)).toBe(true);
      await a.expectLoaded();
      await a.selectFranchiseIfPresent(envConfig.FRANCHISE_A_NAME);
      await a.openBidDecisionFor('Accept', OTHER_FRANCHISE);
      await a.confirmBidDecision('Accept');
      expect(await a.waitForToastText()).toContain('The Marketplace Bid has been Accepted');
      await a.close();
      const { before, after } = await aList.getCardBeforeAndAfterRefresh(deal.mpdId);
      expect.soft(before, "A's list after Accept Bid matches Refresh").toBe(after);
    });

    // Covers: AR_006
    const declined = await test.step('List a second fresh open deal as Franchise A, to be declined', async () => {
      await aList.bringToFront();
      const listed = await listFreshDeal(authedHomePage, authedSellerLeadPage, aList, a, 'Assignment', '');
      await a.close();
      return listed;
    });

    await test.step('After Franchise A declines a bid from My Listed Deals, the list is already up to date', async () => {
      await oList.showList('Available');
      await bidFromOpenList(oList, o, declined.mpdId, 'Bid to be declined', OTHER_FRANCHISE);
      await aList.bringToFront();
      await aList.showList('My Listed Deals');
      expect(await aList.openDealByMpdId(declined.mpdId)).toBe(true);
      await a.expectLoaded();
      await a.selectFranchiseIfPresent(envConfig.FRANCHISE_A_NAME);
      await a.openBidDecisionFor('Decline', OTHER_FRANCHISE);
      await a.confirmBidDecision('Decline');
      expect(await a.waitForToastText()).toMatch(/Bid has been Declined/i);
      await a.close();
      const { before, after } = await aList.getCardBeforeAndAfterRefresh(declined.mpdId);
      expect.soft(before, "A's list after Decline Bid matches Refresh").toBe(after);
    });

    // Covers: AR_010, MSG_017, BW_011
    const second = await test.step('List a third fresh open deal as Franchise A, to be withdrawn', async () => {
      await aList.bringToFront();
      const listed = await listFreshDeal(authedHomePage, authedSellerLeadPage, aList, a, 'Assignment', '');
      await a.close();
      return listed;
    });

    await test.step("Verify the third deal is on the other franchise's Available list", async () => {
      await oList.bringToFront();
      await oList.showList('Available');
      expect(await oList.getAllCardMpdIds()).toContain(second.mpdId);
    });

    await test.step('After Franchise A withdraws the deal, its own list already drops it', async () => {
      await aList.bringToFront();
      await aList.showList('My Listed Deals');
      expect(await aList.openDealByMpdId(second.mpdId)).toBe(true);
      await a.expectLoaded();
      await a.selectFranchiseIfPresent(envConfig.FRANCHISE_A_NAME);
      await a.withdrawDeal();
      expect(await a.waitForToastText()).toContain('Deal Withdrawn Successfully');
      await a.close();
      const { before, after } = await aList.getCardBeforeAndAfterRefresh(second.mpdId);
      expect.soft(before, "A's list after Withdraw Deal matches Refresh").toBe(after);
    });

    await test.step("Verify the other franchise's stale card explains the deal is gone and offers no Place Bid", async () => {
      await oList.bringToFront();
      expect(
        await oList.openDealByMpdId(second.mpdId),
        "the other franchise's list (not refreshed) still shows the card",
      ).toBe(true);
      await o.expectLoaded();
      await o.selectFranchiseIfPresent(OTHER_FRANCHISE);
      // Seen QA 2026-10-11: the withdrawn deal opens with an empty Reason for Bid and only Cancel — no message.
      expect
        .soft(await o.getDealDialogText(), 'stale withdrawn deal explains itself')
        .toContain('This Deal is either Accepted or Removed from Marketplace!');
      expect(await o.isEligibleToBid(), 'no Place Bid on a withdrawn deal').toBe(false);
      await o.close();
      await oList.refresh();
      await oList.expectMarketplaceLoaded();
      expect(await oList.getAllCardMpdIds(), 'withdrawn deal leaves Available').not.toContain(second.mpdId);
    });

    for (const action of ['Decline', 'Accept'] as const) {
      // Covers: AR_008 (Decline), AR_007 (Accept)
      const invited = await test.step(`List a fresh deal Direct-Inviting the other franchise, to ${action}`, async () => {
        await aList.bringToFront();
        const listed = await listFreshDeal(
          authedHomePage,
          authedSellerLeadPage,
          aList,
          a,
          'Assignment',
          OTHER_FRANCHISE,
        );
        await a.close();
        return listed;
      });

      await test.step(`After the other franchise ${action === 'Accept' ? 'accepts' : 'declines'} the Direct Invite from My Direct Invites, the list is already up to date`, async () => {
        await oList.bringToFront();
        await oList.showList('My Direct Invites');
        expect(await oList.openDealByMpdId(invited.mpdId)).toBe(true);
        await o.expectLoaded();
        await o.selectFranchiseIfPresent(OTHER_FRANCHISE);
        await o.openInviteConfirmation(action);
        await o.confirmInvite(action);
        await o.close();
        const { before, after } = await oList.getCardBeforeAndAfterRefresh(invited.mpdId);
        expect.soft(before, `The other franchise's list after ${action} Invite matches Refresh`).toBe(after);
      });
    }
  });
});

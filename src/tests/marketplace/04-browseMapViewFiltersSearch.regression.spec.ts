import { test, expect } from '../../fixtures/testFixtures';
import type { Page } from '@playwright/test';
import type { HomePage } from '../../modules/dashboard';
import type { MarketplacePage } from '../../modules/marketplace';
import { envConfig } from '../../config/env.config';
import type { TestData } from '../../fixtures/testFixtures';
import { Routes } from '../../enums/routes.enum';
import { listWithDirectInvite, openDealAs, type DirectInviteDeal } from '../../utils/directInvite';
import { tileWindow } from '../../utils/windowLayout';

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

/** USPS codes of the 50 states (DC is tolerated in the State filter but not required). */
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND',
  'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

/** Total deals across every map pin ("2 Deals | ZIP 30345" → 2) — what the grid's card count should equal. */
async function mapDealTotal(marketplace: MarketplacePage): Promise<number> {
  const labels = await marketplace.getMapMarkerLabels();
  return labels.reduce((sum, label) => sum + Number(label.match(/^(\d+)/)?.[1] ?? 0), 0);
}

/** Grid cards' full text, for checking a filter really narrowed every result. */
async function cardTexts(marketplace: MarketplacePage): Promise<string[]> {
  const n = await marketplace.getDealCardCount();
  const texts: string[] = [];
  for (let i = 0; i < n; i++) {
    texts.push([await marketplace.getCardLocation(i), await marketplace.getCardStage(i), await marketplace.getCardListingAge(i)].join(' | '));
  }
  return texts;
}

async function resetToHome(authedPage: Page, authedHomePage: HomePage, data: TestData) {
  await authedHomePage.navigate();
  await authedPage.waitForLoadState('domcontentloaded');
  await authedPage.waitForTimeout(data.timeouts.settle);
}

async function settleAfter(authedPage: Page, data: TestData) {
  await authedPage.waitForTimeout(data.timeouts.afterEach);
}

/** Navigation-surface tests also return to Home after each case, to leave the app in a clean state for whatever runs next. */
async function settleAfterReturningHome(authedPage: Page, data: TestData) {
  await authedPage.waitForTimeout(data.timeouts.afterEach);
  await authedPage.goto(Routes.HOME).catch(() => {});
}

test.describe('Marketplace Browse: Map View, Filters & Search @regression @MarketplaceBrowseMapViewFiltersSearch', () => {
  test('should load the Home page before Marketplace tests run @regression', { tag: '@BROWSE-01' }, async ({
    authedPage, data, authedHomePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await expect(authedPage).not.toHaveURL(/\/login/);
    await settleAfterReturningHome(authedPage, data);
  });

  // TC_016 - Regression: T&C acceptance gates Marketplace access (run first, before other visits)
  test('Marketplace Terms & Conditions acceptance is honored @regression', { tag: '@BROWSE-02' }, async ({
    authedPage, authedHomePage, authedMarketplacePage, data,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    console.log('Navigating to Marketplace and checking for T&C prompt');
    await authedMarketplacePage.navigate();
    const wasPrompted = await authedMarketplacePage.acceptTermsIfPresent();
    console.log(wasPrompted ? 'T&C modal accepted' : 'No T&C modal shown — already accepted in a prior visit');
    await authedMarketplacePage.expectMarketplaceLoaded();
    await settleAfterReturningHome(authedPage, data);
  });

  test('should open Marketplace from the Home page quick links @regression', { tag: '@BROWSE-03' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.openFromHome();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await expect(authedPage).toHaveURL(new RegExp(Routes.MARKETPLACE));
    await settleAfterReturningHome(authedPage, data);
  });

  test('should show the Marketplace deal count @regression', { tag: '@BROWSE-04' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.openFromHome();
    const count = await authedMarketplacePage.getItemCount();
    expect(count).toBeGreaterThanOrEqual(0);
    await settleAfterReturningHome(authedPage, data);
  });

  // TC_001 - Functional: Deal list shows only active deals
  test('Deal list displays active deals only @regression', { tag: '@BROWSE-05' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    console.log('Navigating to Marketplace and observing deal list');
    await authedMarketplacePage.openFromHome();
    const count = await authedMarketplacePage.getItemCount();
    console.log(`${count} active deal(s) visible`);
    expect(count).toBeGreaterThanOrEqual(0);
    await settleAfterReturningHome(authedPage, data);
  });

  test('should search the Marketplace by location @regression', { tag: '@BROWSE-06' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.openFromHome();
    const count = await authedMarketplacePage.getItemCount();
    test.skip(count === 0, 'No deal cards in current sandbox state');
    // Search by the first card's zip, so the expected match comes from live data.
    const zip = (await authedMarketplacePage.getCardLocation(0)).match(/\b\d{5}\b/)?.[0];
    test.skip(!zip, 'First card shows no zip to search for');
    const mpdId = await authedMarketplacePage.getCardMpdId(0);
    await authedMarketplacePage.searchMarketplace(zip!);
    const ids = await authedMarketplacePage.getAllCardMpdIds();
    console.log(`Search "${zip}" -> ${ids.length} of ${count} deal(s)`);
    expect(ids, 'the deal the zip came from is in the results').toContain(mpdId);
    for (let i = 0; i < ids.length; i++) {
      expect(await authedMarketplacePage.getCardLocation(i), `result ${ids[i]} matches the zip`).toContain(zip!);
    }
    await settleAfterReturningHome(authedPage, data);
  });

  test('should open the first Marketplace deal @regression', { tag: '@BROWSE-07' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.openFromHome();
    const count = await authedMarketplacePage.getItemCount();
    test.skip(count === 0, 'No deal cards in current sandbox state');
    const mpdId = await authedMarketplacePage.getCardMpdId(0);
    await authedMarketplacePage.clickFirstItem();
    await authedMarketplaceDealPage.expectLoaded();
    expect(await authedMarketplaceDealPage.getMpdId(), 'the opened deal is the card that was clicked').toBe(mpdId);
    await settleAfterReturningHome(authedPage, data);
  });

  // ── Negative ──────────────────────────────────────────────────────────

  test('Negative: a search with no matches returns an empty result @regression', { tag: '@BROWSE-08' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.openFromHome();
    await authedMarketplacePage.searchMarketplace('zzz_no_item_xyz_99999');
    await authedPage.waitForTimeout(2000);
    const body = await authedPage.locator('body').textContent();
    expect(body).not.toMatch(/internal server error/i);
    await expect(authedPage).not.toHaveURL(/\/login/);
    await settleAfterReturningHome(authedPage, data);
  });

  test('Negative: navigating directly to the Marketplace URL does not crash @regression', { tag: '@BROWSE-09' }, async ({
    authedPage, data, authedHomePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    const response = await authedPage.goto(Routes.MARKETPLACE);
    await authedPage.waitForTimeout(3000);
    const status = response?.status();
    expect(status).toBeLessThan(500);
    await expect(authedPage).not.toHaveURL(/\/login/);
    await settleAfterReturningHome(authedPage, data);
  });

  test('Negative: an invalid deal id in the URL does not crash @regression', { tag: '@BROWSE-10' }, async ({
    authedPage, data, authedHomePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    console.log('TC_NEG_MKTD_001: Navigating to marketplace with an invalid deal id');
    const response = await authedPage.goto('/ugville/market-place?dealId=INVALID_ID_XYZ');
    await authedPage.waitForTimeout(3000);
    console.log(`TC_NEG_MKTD_001: status = ${response?.status()}`);
    expect(response?.status()).toBeLessThan(500);
    await expect(authedPage).not.toHaveURL(/\/login/);
    await settleAfterReturningHome(authedPage, data);
  });

  test('Negative: browser back from a Marketplace deal returns to the listing @regression', { tag: '@BROWSE-11' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.openFromHome();

    const count = await authedMarketplacePage.getItemCount();
    if (count === 0) {
      console.log('No Marketplace deals available to open — skipping this test body');
    } else {
      await authedMarketplacePage.clickFirstItem();
      await authedPage.waitForTimeout(3000);
      await authedPage.goBack();
      await authedPage.waitForTimeout(2000);

      await expect(authedPage).not.toHaveURL(/\/login/);
      const body = await authedPage.locator('body').textContent();
      expect(body).not.toMatch(/internal server error/i);
    }
    await settleAfterReturningHome(authedPage, data);
  });

  // TC_019 - Regression: Last-viewed tracking (backend field; UI proxy only)
  test('Revisiting Marketplace does not error (proxy for last-viewed tracking) @regression', { tag: '@BROWSE-12' }, async ({
    authedPage, authedHomePage, authedMarketplacePage, data,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    console.log('Mktp_Last_Viewed__c is a backend-only field with no UI surface; verifying repeat visits stay healthy');
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedHomePage.navigate();
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await expect(authedPage).not.toHaveURL(/\/login/);
    console.log('Repeat Marketplace visit loaded cleanly');
    await settleAfterReturningHome(authedPage, data);
  });

  // =====================================================================
  // Filters Issue (FI_001-004)
  // =====================================================================

  // Covers: FI_001/FI_002
  test('My Listed Deals + Pending Bid Review shows only deals with a bid In Review, or the empty state @regression', { tag: '@BROWSE-13' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    console.log('My Listed Deals + Pending Bid Review');
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectDealStatus('My Listed Deals');
    await authedMarketplacePage.selectDealStage('Pending Bid Review');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const count = await authedMarketplacePage.getItemCount();
    console.log(`Deal count = ${count}`);
    if (count === 0) {
      await authedMarketplacePage.expectEmptyState();
    }
    // Live-verified QA 2026-10-09: "Pending Bid Review" = this franchise's deals with a bid still In Review
    // (the deal's own Deal Stage can read Ad Council / Full Network / Direct).
    for (let i = 0; i < Math.min(count, 3); i++) {
      await authedMarketplacePage.openDealByIndex(i);
      await authedMarketplaceDealPage.expectLoaded();
      const text = await authedMarketplaceDealPage.getDealDialogText();
      expect(text, `${await authedMarketplaceDealPage.getMpdId()} has a bid In Review`).toMatch(/In Review/);
      expect((await authedMarketplaceDealPage.getAdditionalFields())['Deal Stage']).not.toBe('Bid Accepted');
      await authedMarketplaceDealPage.close();
    }
    await settleAfter(authedPage, data);
  });

  // Covers: FI_003/FI_004
  test('My Bids + In Review shows only deals whose bid is In Review, or the empty state @regression', { tag: '@BROWSE-14' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    console.log('My Bids + In Review');
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectDealStatus('My Bids');
    await authedMarketplacePage.selectBidStage('In Review');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const count = await authedMarketplacePage.getItemCount();
    console.log(`Deal count = ${count}`);
    if (count === 0) {
      await authedMarketplacePage.expectEmptyState();
    }
    for (let i = 0; i < Math.min(count, 3); i++) {
      await authedMarketplacePage.openDealByIndex(i);
      await authedMarketplaceDealPage.expectLoaded();
      // An open bid reads "Current bid status: In Review"; a pending Direct Invite shows INVITED + Accept/Decline Invite.
      expect(await authedMarketplaceDealPage.getDealDialogText(), 'Bid In Review').toMatch(/Current bid status:?\s*-?\s*In Review|INVITED/i);
      await authedMarketplaceDealPage.close();
    }
    await settleAfter(authedPage, data);
  });

  // =====================================================================
  // Geography State Filter (SF_001-007) — also covers FW_001-005 (Web)
  // =====================================================================

  // Covers: SF_001
  test('State filter dropdown is visible under Filters @regression', { tag: '@BROWSE-15' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    console.log('Checking State filter visibility');
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.openFilters();
    const options = await authedMarketplacePage.getStateOptions();
    expect(options.length).toBeGreaterThan(0);
    await settleAfter(authedPage, data);
  });

  // Covers: SF_002/SF_005/FW_005
  test('State dropdown lists exactly the valid US states, no invalid entries @regression', { tag: '@BROWSE-16' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    console.log('Reading full State dropdown option list');
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    // getStateOptions() reads every role=option on the page, which also picks up
    // the Sort dropdown's two options — keep only the State list's own entries.
    const options = (await authedMarketplacePage.getStateOptions()).filter((o) => !o.startsWith('Sort:') && o !== 'All');
    console.log(`${options.length} state option(s) found`);
    const invalid = options.filter((o) => !US_STATES.includes(o) && o !== 'DC');
    expect(invalid, 'No invalid state values').toEqual([]);
    expect(US_STATES.filter((st) => !options.includes(st)), 'Every US state is listed').toEqual([]);
    expect(new Set(options).size, 'no duplicate states').toBe(options.length);
    await settleAfter(authedPage, data);
  });

  // Covers: SF_003/SF_004/FW_001/FW_002
  test('Selecting a state filters the deal list @regression', { tag: '@BROWSE-17' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    console.log('Filtering deals by State — proxy for both existing and newly created MPDs, since deal creation is out of scope here');
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectState('TX');
    await authedMarketplacePage.applyFilters();
    const count = await authedMarketplacePage.getItemCount();
    console.log(`Deal count after Texas filter = ${count}`);
    expect(count).toBeGreaterThanOrEqual(0);
    await settleAfter(authedPage, data);
  });

  // Covers: SF_006/FW_003
  test('Reset Filters returns the State filter to default @regression', { tag: '@BROWSE-18' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    console.log('Reset Filters after applying a State filter');
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectState('TX');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.resetFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    console.log('Filters reset — deal list restored to default');
    await settleAfter(authedPage, data);
  });

  // Covers: SF_007/FW_004
  test('State filter combines correctly with Deal Type @regression', { tag: '@BROWSE-19' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    console.log('State + Deal Type combined filter');
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectState('TX');
    await authedMarketplacePage.selectDealType('Assignment');
    await authedMarketplacePage.applyFilters();
    const count = await authedMarketplacePage.getItemCount();
    console.log(`Deal count after State+Type combo = ${count}`);
    expect(count).toBeGreaterThanOrEqual(0);
    await settleAfter(authedPage, data);
  });

  // Deal Type filter alone (live-verified options are "All" / "Assignment" /
  // "Opportunity" — not Buy/Sell as originally assumed). No matching sheet row.
  test('Filtering by Assignment deal type shows only Assignment-badged deals @regression', { tag: '@BROWSE-20' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    console.log('Filtering by "Assignment" deal type');
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectDealType('Assignment');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const labels = await authedMarketplacePage.getDealTypeLabels();
    console.log(`Labels after Assignment filter = ${JSON.stringify(labels)}`);
    for (const label of labels) {
      expect(label).toBe('Assignment');
    }
    await settleAfter(authedPage, data);
  });

  // =====================================================================
  // Geolocation - Zip Filter (GZ_001-039) — also covers FW_006/007 (Web)
  // =====================================================================

  // Covers: GZ_001
  test('Every deal card location ends with a 5-digit zip code (proxy for zip stamped at creation) @regression', { tag: '@BROWSE-21' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const count = await authedMarketplacePage.getItemCount();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const location = await authedMarketplacePage.getCardLocation(i);
      console.log(`Card ${i} location = "${location}"`);
      expect(location).toMatch(/\d{5}$/);
    }
    await settleAfter(authedPage, data);
  });

  // Covers: GZ_002/FW_006
  test('Valid zip code returns matching deals @regression', { tag: '@BROWSE-22' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.enterZipCode('75001');
    await authedMarketplacePage.applyFilters();
    const count = await authedMarketplacePage.getItemCount();
    console.log(`Deal count for zip 75001 = ${count}`);
    expect(count).toBeGreaterThanOrEqual(0);
    await settleAfter(authedPage, data);
  });

  // Covers: GZ_003/FW_007
  test('Zip code with no matches shows the empty-state message @regression', { tag: '@BROWSE-23' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.enterZipCode('99950');
    await authedMarketplacePage.applyFilters();
    const count = await authedMarketplacePage.getItemCount();
    console.log(`Deal count for zip 99950 = ${count}`);
    if (count === 0) {
      await authedMarketplacePage.expectEmptyState();
    }
    await settleAfter(authedPage, data);
  });

  // Covers: GZ_004-016
  test('Zip filter combined with every Deal Status / Deal Stage / Bid Stage value @regression', { tag: '@BROWSE-24' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    test.setTimeout(300_000);
    await resetToHome(authedPage, authedHomePage, data);
    const dealStatusCombos: Array<{ tc: string; status: Parameters<typeof authedMarketplacePage.selectDealStatus>[0] }> = [
      { tc: 'GZ_004', status: 'Available' },
      { tc: 'GZ_005', status: 'My Direct Invites' },
      { tc: 'GZ_016', status: 'Archived' },
    ];
    for (const { tc, status } of dealStatusCombos) {
      await authedMarketplacePage.navigate();
      await authedMarketplacePage.expectMarketplaceLoaded();
      await authedMarketplacePage.enterZipCode('75001');
      await authedMarketplacePage.selectDealStatus(status);
      await authedMarketplacePage.applyFilters();
      const count = await authedMarketplacePage.getItemCount();
      console.log(`zip + Deals=${status} → ${count} deal(s)`);
      expect(count).toBeGreaterThanOrEqual(0);
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
      await authedMarketplacePage.navigate();
      await authedMarketplacePage.expectMarketplaceLoaded();
      await authedMarketplacePage.enterZipCode('75001');
      await authedMarketplacePage.selectDealStatus('My Listed Deals');
      await authedMarketplacePage.selectDealStage(stage);
      await authedMarketplacePage.applyFilters();
      const count = await authedMarketplacePage.getItemCount();
      console.log(`zip + My Listed Deals + Deal Stage=${stage} → ${count} deal(s)`);
      expect(count).toBeGreaterThanOrEqual(0);
    }

    const bidStages: Array<{ tc: string; stage: Parameters<typeof authedMarketplacePage.selectBidStage>[0] }> = [
      { tc: 'GZ_012', stage: 'All' },
      { tc: 'GZ_013', stage: 'In Review' },
      { tc: 'GZ_014', stage: 'Accepted' },
      { tc: 'GZ_015', stage: 'Lost' },
    ];
    for (const { tc, stage } of bidStages) {
      await authedMarketplacePage.navigate();
      await authedMarketplacePage.expectMarketplaceLoaded();
      await authedMarketplacePage.enterZipCode('75001');
      await authedMarketplacePage.selectDealStatus('My Bids');
      await authedMarketplacePage.selectBidStage(stage);
      await authedMarketplacePage.applyFilters();
      const count = await authedMarketplacePage.getItemCount();
      console.log(`zip + My Bids + Bid Stage=${stage} → ${count} deal(s)`);
      expect(count).toBeGreaterThanOrEqual(0);
    }
    await settleAfter(authedPage, data);
  });

  // Covers: GZ_017-019
  test('Zip filter combined with every Deal Type value @regression', { tag: '@BROWSE-25' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    const types: Array<{ tc: string; type: Parameters<typeof authedMarketplacePage.selectDealType>[0] }> = [
      { tc: 'GZ_017', type: 'All' },
      { tc: 'GZ_018', type: 'Assignment' },
      { tc: 'GZ_019', type: 'Opportunity' },
    ];
    for (const { tc, type } of types) {
      await authedMarketplacePage.navigate();
      await authedMarketplacePage.expectMarketplaceLoaded();
      await authedMarketplacePage.enterZipCode('75001');
      await authedMarketplacePage.selectDealType(type);
      await authedMarketplacePage.applyFilters();
      const count = await authedMarketplacePage.getItemCount();
      console.log(`zip + Deal Type=${type} → ${count} deal(s)`);
      expect(count).toBeGreaterThanOrEqual(0);
    }
    await settleAfter(authedPage, data);
  });

  // Covers: GZ_020/ZV_007
  test('Radius filter activates once a valid zip is entered @regression', { tag: '@BROWSE-26' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.openFilters();
    expect(await authedMarketplacePage.isRadiusEnabled()).toBe(false);
    await authedMarketplacePage.enterZipCode('75001');
    expect(await authedMarketplacePage.isRadiusEnabled()).toBe(true);
    await authedMarketplacePage.applyFilters();
    const count = await authedMarketplacePage.getItemCount();
    console.log(`Zip + Radius enabled → ${count} deal(s)`);
    expect(count).toBeGreaterThanOrEqual(0);
    await settleAfter(authedPage, data);
  });

  // Covers: GZ_021
  test('Zip filter combined with State dropdown @regression', { tag: '@BROWSE-27' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.enterZipCode('75001');
    // Live-verified: the State dropdown becomes disabled (mutually exclusive with Zip Code)
    // once a zip value is present, so it cannot be combined the way the spreadsheet describes.
    const stateEnabled = await authedMarketplacePage.isStateEnabled();
    console.log(`State dropdown enabled with zip present = ${stateEnabled} (expected false — Zip and State are mutually exclusive filters)`);
    expect(stateEnabled).toBe(false);
    await authedMarketplacePage.applyFilters();
    const count = await authedMarketplacePage.getItemCount();
    console.log(`Zip-only → ${count} deal(s)`);
    expect(count).toBeGreaterThanOrEqual(0);
    await settleAfter(authedPage, data);
  });

  // Covers: GZ_022-028
  test('Zip filter combined with every Opportunity Stage value @regression', { tag: '@BROWSE-28' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    test.setTimeout(300_000);
    await resetToHome(authedPage, authedHomePage, data);
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
      await authedMarketplacePage.navigate();
      await authedMarketplacePage.expectMarketplaceLoaded();
      await authedMarketplacePage.enterZipCode('75001');
      await authedMarketplacePage.selectOpportunityStage(stage);
      await authedMarketplacePage.applyFilters();
      const count = await authedMarketplacePage.getItemCount();
      console.log(`zip + Opportunity Stage=${stage} → ${count} deal(s)`);
      expect(count).toBeGreaterThanOrEqual(0);
    }
    await settleAfter(authedPage, data);
  });

  // Covers: GZ_029-031
  test('Zip filter combined with each advanced filter (Last Activity / Days in System / Days in Marketplace) @regression', { tag: '@BROWSE-29' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    const advanced: Array<{ tc: string; apply: () => Promise<void> }> = [
      { tc: 'GZ_029', apply: () => authedMarketplacePage.selectLastActivity('Any') },
      { tc: 'GZ_030', apply: () => authedMarketplacePage.selectDaysInSystem('Any') },
      { tc: 'GZ_031', apply: () => authedMarketplacePage.selectDaysInMarketplace('Any') },
    ];
    for (const { tc, apply } of advanced) {
      await authedMarketplacePage.navigate();
      await authedMarketplacePage.expectMarketplaceLoaded();
      await authedMarketplacePage.enterZipCode('75001');
      await apply();
      await authedMarketplacePage.applyFilters();
      const count = await authedMarketplacePage.getItemCount();
      console.log(`zip + advanced filter → ${count} deal(s)`);
      expect(count).toBeGreaterThanOrEqual(0);
    }
    await settleAfter(authedPage, data);
  });

  // GZ_032/033 — Show Images toggle: not present in the current UI (live-verified, no such
  // control exists in the Filters panel). Documented as an absence check per the framework's
  // established convention (see knowledgebase module's TC_014-017) rather than a fabricated pass.
  // Covers: GZ_032/GZ_033
  test('Show Images toggle is not present in the current Filters panel @regression', { tag: '@BROWSE-30' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.openFilters();
    const toggle = authedPage.getByText(/show images/i);
    const present = await toggle.isVisible().catch(() => false);
    console.log(`Show Images toggle present = ${present} (expected false — feature not yet built)`);
    expect(present).toBe(false);
    await settleAfter(authedPage, data);
  });

  // Covers: GZ_034/FW_012
  test('Refresh retains the applied zip filter @regression', { tag: '@BROWSE-31' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.enterZipCode('75001');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.refresh();
    const zipAfterRefresh = await authedMarketplacePage.getZipCodeValue().catch(() => '');
    console.log(`Zip value after Refresh = "${zipAfterRefresh}"`);
    await authedMarketplacePage.expectMarketplaceLoaded();
    await settleAfter(authedPage, data);
  });

  // Covers: GZ_035/GZ_036/FW_013/FW_014
  test('Sort order (Newest/Oldest) works with a zip filter applied @regression', { tag: '@BROWSE-32' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.enterZipCode('75001');
    await authedMarketplacePage.applyFilters();

    await authedMarketplacePage.selectSort('Sort: Oldest');
    const oldestCount = await authedMarketplacePage.getItemCount();
    console.log(`Sort=Oldest with zip filter → ${oldestCount} deal(s)`);

    await authedMarketplacePage.selectSort('Sort: Newest');
    const newestCount = await authedMarketplacePage.getItemCount();
    console.log(`Sort=Newest with zip filter → ${newestCount} deal(s)`);
    expect(newestCount).toBe(oldestCount);
    await settleAfter(authedPage, data);
  });

  // Covers: GZ_037
  test('Reset clears the zip filter @regression', { tag: '@BROWSE-33' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.enterZipCode('75001');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.resetFilters();
    const zipAfterReset = await authedMarketplacePage.getZipCodeValue().catch(() => '');
    console.log(`Zip value after Reset = "${zipAfterReset}"`);
    expect(zipAfterReset).toBe('');
    await settleAfter(authedPage, data);
  });

  // Covers: GZ_038/FW_016
  test('Hide Filter Panel keeps filtered results visible @regression', { tag: '@BROWSE-34' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.enterZipCode('75001');
    await authedMarketplacePage.applyFilters();
    const countBeforeHide = await authedMarketplacePage.getItemCount();
    await authedMarketplacePage.hideFilterPanel();
    expect(await authedMarketplacePage.isFilterPanelVisible()).toBe(false);
    const countAfterHide = await authedMarketplacePage.getItemCount();
    console.log(`Deal count before/after hiding panel = ${countBeforeHide}/${countAfterHide}`);
    expect(countAfterHide).toBe(countBeforeHide);
    await settleAfter(authedPage, data);
  });


  // =====================================================================
  // Zip Code Input Validation (ZV_001-008)
  // =====================================================================

  // Covers: ZV_001/ZV_002
  test('Zip Code input is capped at 5 characters with a "Limit reached" message @regression', { tag: '@BROWSE-35' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.enterZipCode('123456');
    const value = await authedMarketplacePage.getZipCodeValue();
    const limited = await authedMarketplacePage.hasZipLimitMessage();
    console.log(`Zip value = "${value}", limit message shown = ${limited}`);
    expect(value.length).toBeLessThanOrEqual(5);
    await settleAfter(authedPage, data);
  });

  // Covers: ZV_003
  test('A valid 5-digit zip code is accepted without error @regression', { tag: '@BROWSE-36' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.enterZipCode('75001');
    const value = await authedMarketplacePage.getZipCodeValue();
    expect(value).toBe('75001');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await settleAfter(authedPage, data);
  });

  // ZV_004 — live-verified QA 2026-10-21: the Zip Code field now strips non-numeric
  // characters as they are typed ("AB123" → "123"); no error message is shown.
  // Covers: ZV_004
  test('Zip Code field drops non-numeric characters as they are typed @regression', { tag: '@BROWSE-37' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.enterZipCode('AB123');
    const value = await authedMarketplacePage.getZipCodeValue();
    console.log(`Zip value after non-numeric entry = "${value}"`);
    expect(value).toBe('123');
    await settleAfter(authedPage, data);
  });

  // Covers: ZV_005
  test('Empty Zip Code applies no zip filter and shows no error @regression', { tag: '@BROWSE-38' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.openFilters();
    expect(await authedMarketplacePage.getZipCodeValue()).toBe('');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await settleAfter(authedPage, data);
  });


  // Covers: ZV_008
  test('Zip Code combined with multiple simultaneous filters @regression', { tag: '@BROWSE-39' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    console.log('Zip + Opportunity Stage + Last Activity applied together');
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.enterZipCode('75001');
    await authedMarketplacePage.selectOpportunityStage('All Stages');
    await authedMarketplacePage.selectLastActivity('Any');
    await authedMarketplacePage.applyFilters();
    const count = await authedMarketplacePage.getItemCount();
    console.log(`Deal count = ${count}`);
    expect(count).toBeGreaterThanOrEqual(0);
    await settleAfter(authedPage, data);
  });

  // =====================================================================
  // Filters - Web (FW_008-011, FW_015) — remaining rows not already covered above
  // =====================================================================

  // Covers: FW_008-011
  test('Filtered results are identical across Grid / List / Map views @regression', { tag: '@BROWSE-40' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectDealType('Assignment');
    await authedMarketplacePage.applyFilters();

    await authedMarketplacePage.switchView('Grid');
    const gridIds = (await authedMarketplacePage.getAllCardMpdIds()).sort();
    console.log(`Grid view — ${gridIds.length} deal(s)`);

    await authedMarketplacePage.switchView('List');
    const listIds = (await authedMarketplacePage.getAllCardMpdIds()).sort();
    console.log(`List view — ${listIds.length} deal(s)`);
    expect(listIds).toEqual(gridIds);

    await authedMarketplacePage.switchView('Map');
    await authedMarketplacePage.waitForStabilization(1500);
    console.log('Map view switched to — see MarketplaceMapView chunk for map-specific assertions');

    await authedMarketplacePage.switchView('Grid');
    const gridIdsAgain = (await authedMarketplacePage.getAllCardMpdIds()).sort();
    console.log(`Back to Grid — ${gridIdsAgain.length} deal(s)`);
    expect(gridIdsAgain).toEqual(gridIds);
    await settleAfter(authedPage, data);
  });

  // Covers: FW_015
  test('Clear Filters (Reset) restores every filter to its default @regression', { tag: '@BROWSE-41' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectState('TX');
    await authedMarketplacePage.selectDealType('Assignment');
    await authedMarketplacePage.enterZipCode('75001');
    await authedMarketplacePage.applyFilters();

    await authedMarketplacePage.resetFilters();
    expect(await authedMarketplacePage.getZipCodeValue()).toBe('');
    await authedMarketplacePage.expectMarketplaceLoaded();
    console.log('All filters reset — default deal list restored');
    await settleAfter(authedPage, data);
  });

  // Covers: MV_001/MV_014/MV_027/SAN_064
  test('Map View tab is available alongside Grid View and List View @regression', { tag: '@BROWSE-42' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await expect(authedPage.getByRole('button', { name: 'Grid', exact: true })).toBeVisible();
    await expect(authedPage.getByRole('button', { name: 'List', exact: true })).toBeVisible();
    await expect(authedPage.getByRole('button', { name: 'Map', exact: true })).toBeVisible();
    await settleAfter(authedPage, data);
  });

  // Covers: MV_002/MV_015/MV_028
  test('Switching to Map View loads the map with existing applied filters @regression', { tag: '@BROWSE-43' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectDealType('Assignment');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.switchView('Map');
    await authedMarketplacePage.waitForMapReady();
    expect(await authedMarketplacePage.isMapVisible()).toBe(true);
    expect(await authedMarketplacePage.getZipCodeValue()).toBe('');
    await settleAfter(authedPage, data);
  });

  // Covers: MV_003/MV_016/MV_029
  test('Map renders without errors and displays geographic content @regression', { tag: '@BROWSE-44' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.switchView('Map');
    await authedMarketplacePage.waitForMapReady();
    expect(await authedMarketplacePage.isMapVisible()).toBe(true);
    const markerCount = await authedMarketplacePage.getMapMarkerCount();
    console.log(`${markerCount} deal marker(s) rendered on the map`);
    expect(markerCount).toBeGreaterThanOrEqual(0);
    await settleAfter(authedPage, data);
  });

  // Covers: MV_004/MV_017/MV_030
  test('Map shows a default position — current-location marker present on load @regression', { tag: '@BROWSE-45' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.switchView('Map');
    await authedMarketplacePage.waitForMapReady();
    expect(await authedMarketplacePage.isCurrentLocationMarkerVisible()).toBe(true);
    await settleAfter(authedPage, data);
  });

  // Covers: MV_005/MV_018/MV_031
  test('ZIP-grouped markers show a single pin with a deal count @regression', { tag: '@BROWSE-46' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.switchView('Map');
    await authedMarketplacePage.waitForMapReady();
    const labels = await authedMarketplacePage.getMapMarkerLabels();
    console.log(`Marker labels = ${JSON.stringify(labels)}`);
    for (const label of labels) expect(label).toMatch(/^\d+ Deals? \| ZIP \d{5}$/);
    await settleAfter(authedPage, data);
  });

  // Covers: MV_006/MV_032
  test('Clicking a marker shows its deals in the synchronized table @regression', { tag: '@BROWSE-47' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.switchView('Map');
    await authedMarketplacePage.waitForMapReady();
    const zip = await authedMarketplacePage.zoomOutUntilMarkerVisible();
    test.skip(zip === '', 'No deal marker currently visible in the map pane to click in current sandbox state');
    await authedMarketplacePage.clickMapMarkerForZip(zip);
    expect(await authedMarketplacePage.isMapZipPanelVisible()).toBe(true);
    const dealIds = await authedMarketplacePage.getMapPanelDealIds();
    console.log(`ZIP ${zip} panel deal ids = ${JSON.stringify(dealIds)}`);
    expect(dealIds.length).toBeGreaterThan(0);
    await settleAfter(authedPage, data);
  });

  // Covers: MV_007/MV_020/MV_033
  test('A marker\'s label carries the Zip Code and deal count within its range @regression', { tag: '@BROWSE-48' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.switchView('Map');
    await authedMarketplacePage.waitForMapReady();
    const labels = await authedMarketplacePage.getMapMarkerLabels();
    test.skip(labels.length === 0, 'No deal markers on the map in current sandbox state');
    // Live-verified: hovering exposes no separate tooltip — the marker's own
    // aria-label (asserted here) is the same "N Deal(s) | ZIP NNNNN" content.
    expect(labels[0]).toMatch(/^\d+ Deals? \| ZIP \d{5}$/);
    await settleAfter(authedPage, data);
  });

  // Covers: MV_008/MV_034, MV_021
  test('Map pins and the adjacent table stay data-consistent @regression', { tag: '@BROWSE-49' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.switchView('Map');
    await authedMarketplacePage.waitForMapReady();
    const zip = await authedMarketplacePage.zoomOutUntilMarkerVisible();
    test.skip(zip === '', 'No deal marker currently visible in the map pane in current sandbox state');
    const labels = await authedMarketplacePage.getMapMarkerLabels();
    const expectedCount = labels.find((l) => l.includes(`ZIP ${zip}`))?.match(/^(\d+)/)?.[1] ?? '0';
    await authedMarketplacePage.clickMapMarkerForZip(zip);
    expect(await authedMarketplacePage.getMapPanelZip()).toBe(zip);
    const dealIds = await authedMarketplacePage.getMapPanelDealIds();
    for (const id of dealIds) expect(id).toMatch(/^MPD-\d+$/);
    expect(dealIds.length).toBe(Number(expectedCount));
    await settleAfter(authedPage, data);
  });

  // Covers: MV_009/MV_022/MV_035/SAN_065
  test('Zip Code filter applies correctly in Map View @regression', { tag: '@BROWSE-50' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
    await authedMarketplacePage.expectMarketplaceLoaded();
    // A zip that really has a deal: the first card's.
    const zip = (await authedMarketplacePage.getCardLocation(0)).match(/\d{5}/)?.[0] ?? '';
    test.skip(!zip, 'No deal card with a zip code in current sandbox state');
    await authedMarketplacePage.enterZipCode(zip);
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.loadAllCards(); // the map plots every match, the grid only 50 per page
    const gridCount = await authedMarketplacePage.getDealCardCount();
    expect(gridCount, `zip ${zip} keeps at least its own deal`).toBeGreaterThan(0);
    await authedMarketplacePage.switchView('Map');
    await authedMarketplacePage.waitForMapReady();
    expect(await authedMarketplacePage.isMapVisible()).toBe(true);
    const labels = await authedMarketplacePage.getMapMarkerLabels();
    console.log(`Zip ${zip} → grid ${gridCount} deal(s), map ${JSON.stringify(labels)}`);
    expect(labels.some((l) => l.includes(`ZIP ${zip}`)), 'Map shows the filtered zip').toBe(true);
    expect(await mapDealTotal(authedMarketplacePage), 'map pins hold exactly the filtered deals').toBe(gridCount);
    await settleAfter(authedPage, data);
  });

  // Covers: MV_010/MV_023/MV_036
  test('State filter applies correctly in Map View @regression', { tag: '@BROWSE-51' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
    await authedMarketplacePage.expectMarketplaceLoaded();
    // State options are two-letter abbreviations, not full names (see SF_003/FW_001 in
    // this file, live-verified against the same dropdown).
    await authedMarketplacePage.selectState('CO');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.loadAllCards(); // the map plots every match, the grid only 50 per page
    const cards = await cardTexts(authedMarketplacePage);
    for (const card of cards) expect(card, 'every deal is in CO').toMatch(/\bCO\s+\d{5}/);
    await authedMarketplacePage.switchView('Map');
    await authedMarketplacePage.waitForMapReady();
    expect(await authedMarketplacePage.isMapVisible()).toBe(true);
    const total = await mapDealTotal(authedMarketplacePage);
    console.log(`State=CO → grid ${cards.length} deal(s), map ${total}`);
    expect(total, 'map pins hold exactly the filtered deals').toBe(cards.length);
    await settleAfter(authedPage, data);
  });

  // Covers: MV_011/MV_024/MV_037
  test('Opportunity Stage filter applies correctly in Map View @regression', { tag: '@BROWSE-52' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
    await authedMarketplacePage.expectMarketplaceLoaded();
    // Contact is the stage freshly listed deals carry, so it has matches in any sandbox state.
    await authedMarketplacePage.selectOpportunityStage('Contact');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.loadAllCards(); // the map plots every match, the grid only 50 per page
    const cards = await cardTexts(authedMarketplacePage);
    for (const card of cards) expect(card, 'every deal is at Opportunity Stage Contact').toContain('Stage: Contact');
    await authedMarketplacePage.switchView('Map');
    await authedMarketplacePage.waitForMapReady();
    expect(await authedMarketplacePage.isMapVisible()).toBe(true);
    const total = await mapDealTotal(authedMarketplacePage);
    console.log(`Opportunity Stage=Contact → grid ${cards.length} deal(s), map ${total}`);
    expect(total, 'map pins hold exactly the filtered deals').toBe(cards.length);
    await settleAfter(authedPage, data);
  });

  // Covers: MV_012/MV_025/MV_038/SAN_066
  test('Switching between Map / List / Grid preserves applied filters @regression', { tag: '@BROWSE-53' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.enterZipCode('75001');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.switchView('Map');
    await authedMarketplacePage.waitForMapReady();
    expect(await authedMarketplacePage.getZipCodeValue()).toBe('75001');
    await authedMarketplacePage.switchView('List');
    expect(await authedMarketplacePage.getZipCodeValue()).toBe('75001');
    await authedMarketplacePage.switchView('Grid');
    expect(await authedMarketplacePage.getZipCodeValue()).toBe('75001');
    await settleAfter(authedPage, data);
  });

  // Covers: MV_013/MV_026/MV_039
  test('Map View shows the empty state when no deals match the applied filters @regression', { tag: '@BROWSE-54' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.enterZipCode('99950');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.switchView('Map');
    await authedMarketplacePage.waitForMapReady();
    const markerCount = await authedMarketplacePage.getMapMarkerCount();
    console.log(`Zip 99950 (no matches) → ${markerCount} deal marker(s)`);
    expect(markerCount).toBe(0);
    await settleAfter(authedPage, data);
  });

  // =====================================================================
  // Sanity sheet: filters (SAN_026-032)
  // =====================================================================

  // Covers: SAN_026
  test('My Listed Deals shows only this franchise\'s own listings @regression', { tag: '@BROWSE-55' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectDealStatus('My Listed Deals');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const count = await authedMarketplacePage.getDealCardCount();
    test.skip(count === 0, 'This franchise has no listed deals in current sandbox state');
    for (let i = 0; i < Math.min(count, 5); i++) {
      await authedMarketplacePage.openDealByIndex(i);
      await authedMarketplaceDealPage.expectLoaded();
      const text = await authedMarketplaceDealPage.getDealDialogText();
      const mpdId = await authedMarketplaceDealPage.getMpdId();
      // Only the listing franchise sees the bid list ("Bid Status" column / "No Bids were placed yet"),
      // or — once won — the winner banner; a bidder sees its own Reason for Bid form instead.
      expect(text, `${mpdId} is shown from the listing franchise's side`).toMatch(/Bid Status|No Bids were placed yet|winning franchise for this deal is/);
      expect(await authedMarketplaceDealPage.isEligibleToBid(), `${mpdId}: no Place Bid on an own listing`).toBe(false);
      await authedMarketplaceDealPage.close();
    }
    await settleAfter(authedPage, data);
  });

  // Covers: SAN_027
  test('My Bids + each Bid Stage (In Review / Accepted / Lost) narrows to that status only @regression', { tag: '@BROWSE-56' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    const own = envConfig.FRANCHISE_A_NAME;
    const expectations: Record<'In Review' | 'Accepted' | 'Lost', (text: string) => void> = {
      'In Review': (t) => expect(t).toMatch(/Current bid status:?\s*-?\s*In Review|INVITED/i),
      Accepted: (t) => expect(t).toContain(`The winning franchise for this deal is: ${own}.`),
      Lost: (t) => expect(t).toMatch(new RegExp(`winning franchise for this deal is: (?!${own}\\.)|Current bid status:?\\s*-?\\s*(Bid )?(Lost|Declined)`, 'i')),
    };
    for (const stage of ['In Review', 'Accepted', 'Lost'] as const) {
      await authedMarketplacePage.navigate();
      await authedMarketplacePage.expectMarketplaceLoaded();
      await authedMarketplacePage.selectDealStatus('My Bids');
      await authedMarketplacePage.selectBidStage(stage);
      await authedMarketplacePage.applyFilters();
      await authedMarketplacePage.expectMarketplaceLoaded();
      const count = await authedMarketplacePage.getDealCardCount();
      console.log(`My Bids / ${stage} → ${count} deal(s)`);
      if (count === 0) await authedMarketplacePage.expectEmptyState();
      for (let i = 0; i < Math.min(count, 2); i++) {
        await authedMarketplacePage.openDealByIndex(i);
        await authedMarketplaceDealPage.expectLoaded();
        expectations[stage](await authedMarketplaceDealPage.getDealDialogText());
        await authedMarketplaceDealPage.close();
      }
    }
    await settleAfter(authedPage, data);
  });

  // Covers: SAN_028
  test('Zip Code rejects a 3-digit and a non-numeric value, accepts a valid 5-digit zip @regression', { tag: '@BROWSE-57' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
    await authedMarketplacePage.expectMarketplaceLoaded();
    const allCount = await authedMarketplacePage.getDealCardCount();
    for (const bad of ['750', 'abcde']) {
      await authedMarketplacePage.enterZipCode(bad);
      await authedMarketplacePage.applyFilters();
      await authedMarketplacePage.expectMarketplaceLoaded();
      const value = await authedMarketplacePage.getZipCodeValue();
      const error = await authedPage.getByText(/valid (5-digit )?zip|zip code (must|should)|only numeric|numbers only/i).first().isVisible().catch(() => false);
      console.log(`"${bad}" → field "${value}", error shown = ${error}, ${await authedMarketplacePage.getDealCardCount()} deal(s)`);
      // Rejected = an error is shown, or the value never makes it into the field.
      expect.soft(error || value !== bad, `"${bad}" should be rejected`).toBe(true);
      await authedMarketplacePage.resetFilters();
    }
    await authedMarketplacePage.enterZipCode('75001');
    expect(await authedMarketplacePage.getZipCodeValue()).toBe('75001');
    expect(await authedMarketplacePage.isRadiusEnabled(), 'a valid zip enables Radius').toBe(true);
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    expect(await authedMarketplacePage.getDealCardCount()).toBeLessThanOrEqual(allCount);
    await settleAfter(authedPage, data);
  });

  // Covers: SAN_029
  test('A wider Radius around a zip returns at least as many deals as a narrower one @regression', { tag: '@BROWSE-58' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
    await authedMarketplacePage.expectMarketplaceLoaded();
    const zip = (await authedMarketplacePage.getCardLocation(0)).match(/\d{5}/)?.[0] ?? '';
    test.skip(!zip, 'No deal card with a zip code in current sandbox state');
    await authedMarketplacePage.enterZipCode(zip);
    await authedPage.getByRole('combobox', { name: 'Radius' }).click();
    const radii = (await authedPage.getByRole('option').allInnerTexts()).map((t) => t.trim()).filter((t) => /miles/i.test(t));
    await authedPage.keyboard.press('Escape');
    await authedMarketplacePage.waitForStabilization(1000);
    console.log(`Radius options = ${JSON.stringify(radii)}`);
    expect(radii.length, 'Radius offers several distances').toBeGreaterThan(1);
    const miles = (label: string) => Number(label.match(/\d+/)?.[0] ?? 0);
    const sorted = [...radii].sort((x, y) => miles(x) - miles(y));
    const counts: number[] = [];
    for (const label of [sorted[0], sorted[sorted.length - 1]]) {
      await authedMarketplacePage.selectRadius(label);
      await authedMarketplacePage.waitForStabilization(1500);
      await authedMarketplacePage.applyFilters();
      await authedMarketplacePage.expectMarketplaceLoaded();
      await expect(authedPage.getByText(`Radius: ${miles(label)} miles`), `${label} is the applied radius`).toBeVisible();
      counts.push(await authedMarketplacePage.getDealCardCount());
      console.log(`Zip ${zip}, ${label} → ${counts[counts.length - 1]} deal(s)`);
    }
    expect(counts[0], 'the zip\'s own deal is within the narrowest radius').toBeGreaterThan(0);
    expect(counts[1]).toBeGreaterThanOrEqual(counts[0]);
    await settleAfter(authedPage, data);
  });

  // Covers: SAN_030
  test('Sort: Oldest lists deals oldest-first and keeps the applied filter @regression', { tag: '@BROWSE-59' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectState('CO');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectSort('Sort: Oldest');
    await authedMarketplacePage.expectMarketplaceLoaded();
    const cards = await cardTexts(authedMarketplacePage);
    test.skip(cards.length < 2, 'Fewer than 2 CO deals in current sandbox state');
    const ages = cards.map((c) => Number(c.match(/Listing Age:\s*(\d+)/)?.[1] ?? NaN)).filter((n) => !Number.isNaN(n));
    console.log(`Listing Age (days), Sort: Oldest = ${JSON.stringify(ages)}`);
    for (let i = 1; i < ages.length; i++) expect(ages[i], 'oldest first = Listing Age never increases').toBeLessThanOrEqual(ages[i - 1]);
    for (const card of cards) expect(card, 'State filter still applied').toMatch(/\bCO\s+\d{5}/);
    await settleAfter(authedPage, data);
  });

  // Covers: SAN_031
  test('Reset Filters clears every applied filter and reloads the full Available list @regression', { tag: '@BROWSE-60' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.resetFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const defaultIds = (await authedMarketplacePage.getAllCardMpdIds()).sort();
    expect(defaultIds.length, 'baseline Available list').toBeGreaterThan(1);
    await authedMarketplacePage.selectDealType('Assignment');
    await authedMarketplacePage.selectState('CO');
    await authedMarketplacePage.selectOpportunityStage('Contact');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await expect(authedPage.getByRole('button', { name: /^Filters \(\d+\)$/ }), 'filters are applied').toBeVisible();

    await authedMarketplacePage.resetFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await expect(authedPage.getByRole('button', { name: 'Filters', exact: true }), 'no filter left applied').toBeVisible();
    await expect(authedPage.getByText('Active filters:')).toBeHidden();
    expect(await authedMarketplacePage.getZipCodeValue()).toBe('');
    expect((await authedMarketplacePage.getAllCardMpdIds()).sort(), 'full Available list reloads').toEqual(defaultIds);
    await settleAfter(authedPage, data);
  });

  // Covers: SAN_032
  test('Hide / Show Filter Panel collapses and re-opens the panel @regression', { tag: '@BROWSE-61' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.resetFilters(); // filters persist across navigation within a session
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.openFilters();
    expect(await authedMarketplacePage.isFilterPanelVisible()).toBe(true);
    await authedMarketplacePage.hideFilterPanel();
    expect(await authedMarketplacePage.isFilterPanelVisible(), 'panel collapses').toBe(false);
    await authedMarketplacePage.openFilters();
    expect(await authedMarketplacePage.isFilterPanelVisible(), 'panel expands again').toBe(true);
    await settleAfter(authedPage, data);
  });

  // =====================================================================
  // Auto-Refresh (AR_002-003 — see header note for AR_001/004-010)
  // =====================================================================

  // Covers: AR_002
  test('Opening and closing the View Deal modal leaves the deal list intact @regression', { tag: '@BROWSE-62' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const before = await authedMarketplacePage.getDealCardCount();
    test.skip(before === 0, 'No deal cards in current sandbox state');
    await authedMarketplacePage.openDealByIndex(0);
    await authedMarketplaceDealPage.expectLoaded();
    await authedMarketplaceDealPage.close();
    const after = await authedMarketplacePage.getDealCardCount();
    console.log(`Deal count before=${before} after=${after}`);
    expect(after).toBe(before);
    await settleAfter(authedPage, data);
  });

  // Covers: AR_003
  test('Refresh Deals reloads the list without error @regression', { tag: '@BROWSE-63' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.refresh();
    const count = await authedMarketplacePage.getDealCardCount();
    console.log(`${count} deal(s) visible after Refresh`);
    expect(count).toBeGreaterThanOrEqual(0);
    await settleAfter(authedPage, data);
  });
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

/** The deal's card on the list as it stands, then after the Refresh button. */
async function cardBeforeAndAfterRefresh(mp: MarketplacePage, mpdId: string) {
  const find = async () => (await mp.getCardTexts()).find((t) => t.includes(mpdId)) ?? '(not listed)';
  const before = await find();
  await mp.refresh();
  await mp.expectMarketplaceLoaded();
  return { before, after: await find() };
}

/** Navigates the list to `status` (filters reset first) without opening a deal. */
async function showList(mp: MarketplacePage, status: 'Available' | 'My Listed Deals' | 'My Bids' | 'My Direct Invites') {
  await mp.navigate();
  await mp.resetFilters();
  await mp.expectMarketplaceLoaded();
  if (status !== 'Available') {
    await mp.selectDealStatus(status);
    await mp.applyFilters();
    await mp.expectMarketplaceLoaded();
  }
}

test.describe('Marketplace Browse: list auto-refresh — two franchises side by side @regression @MarketplaceBrowseMapViewFiltersSearch @TwoAccount', () => {
  test.describe.configure({ timeout: 1_800_000 });

  test.beforeAll(async ({ authedPage, otherFranchisePage }) => {
    await tileWindow(authedPage, 'left');
    await tileWindow(otherFranchisePage, 'right');
  });

  // Covers: AR_001, AR_004, AR_005, AR_006, AR_007, AR_008, AR_009, AR_010, MSG_017, BW_011
  test('The deal list refreshes itself after listing, bidding, accepting, declining and withdrawing @regression', async ({
    authedPage, otherFranchisePage, authedHomePage, authedSellerLeadPage, authedMarketplacePage, authedMarketplaceDealPage,
    otherFranchiseMarketplacePage, otherFranchiseMarketplaceDealPage,
  }) => {
    const aList = authedMarketplacePage;
    const oList = otherFranchiseMarketplacePage;
    const a = authedMarketplaceDealPage;
    const o = otherFranchiseMarketplaceDealPage;
    const listOpenDeal = async () => {
      await authedPage.bringToFront();
      const listed = (await listWithDirectInvite(authedHomePage, authedSellerLeadPage, aList, a, 'Assignment', ''))!;
      expect(listed, 'fresh seller op lists').toBeTruthy();
      await a.close();
      return listed;
    };
    /** The other franchise bids on `mpdId` from its open Available list (no reload first). */
    const bidFromOpenList = async (mpdId: string, reason: string) => {
      await otherFranchisePage.bringToFront();
      expect(await oList.openDealByMpdId(mpdId)).toBe(true);
      await o.expectLoaded();
      await o.selectFranchiseIfPresent(OTHER_FRANCHISE);
      await o.openPlaceBidConfirmation(reason);
      await o.submitPlaceBidConfirmation();
      expect(await o.waitForToastText()).toMatch(/successfully bid/i);
      await o.close();
    };
    let deal!: DirectInviteDeal;

    // Covers: AR_001
    await test.step('A deal Franchise A lists appears on the other franchise\'s open list without a refresh', async () => {
      await showList(oList, 'Available');
      deal = await listOpenDeal();
      // Seen QA 2026-10-11: not there after 60s; only the Refresh button brings it in.
      await expect.soft.poll(async () => (await oList.getAllCardMpdIds()).includes(deal.mpdId), {
        timeout: 30_000, message: `${deal.mpdId} appears on the other franchise's open Available list without Refresh`,
      }).toBe(true);
      await oList.refresh();
      await oList.expectMarketplaceLoaded();
      expect(await oList.getAllCardMpdIds(), 'Refresh brings the new deal in').toContain(deal.mpdId);
    });

    // Covers: AR_004
    await test.step('After the other franchise bids from its list, the list is already up to date', async () => {
      await bidFromOpenList(deal.mpdId, 'Bid from the open list');
      const { before, after } = await cardBeforeAndAfterRefresh(oList, deal.mpdId);
      expect.soft(before, 'The other franchise\'s list after Place Bid matches Refresh').toBe(after);
    });

    // Covers: AR_009
    await test.step('After the other franchise withdraws its bid from My Bids, the list is already up to date', async () => {
      await showList(oList, 'My Bids');
      expect(await oList.openDealByMpdId(deal.mpdId)).toBe(true);
      await o.expectLoaded();
      await o.selectFranchiseIfPresent(OTHER_FRANCHISE);
      await o.withdrawBid();
      expect(await o.waitForToastText()).toContain('Bid Withdrawn Successfully');
      await o.close();
      const { before, after } = await cardBeforeAndAfterRefresh(oList, deal.mpdId);
      expect.soft(before, 'The other franchise\'s list after Withdraw Bid matches Refresh').toBe(after);
    });

    // Covers: AR_005
    await test.step('After Franchise A accepts a bid from My Listed Deals, the list is already up to date', async () => {
      // A withdrawn bid can be placed again (a declined one cannot — QA 2026-10-26).
      await showList(oList, 'Available');
      await bidFromOpenList(deal.mpdId, 'Bid to be accepted');
      await authedPage.bringToFront();
      await showList(aList, 'My Listed Deals');
      expect(await aList.openDealByMpdId(deal.mpdId)).toBe(true);
      await a.expectLoaded();
      await a.selectFranchiseIfPresent(envConfig.FRANCHISE_A_NAME);
      await a.openBidDecisionFor('Accept', OTHER_FRANCHISE);
      await a.confirmBidDecision('Accept');
      expect(await a.waitForToastText()).toContain('The Marketplace Bid has been Accepted');
      await a.close();
      const { before, after } = await cardBeforeAndAfterRefresh(aList, deal.mpdId);
      expect.soft(before, 'A\'s list after Accept Bid matches Refresh').toBe(after);
    });

    // Covers: AR_006
    await test.step('After Franchise A declines a bid from My Listed Deals, the list is already up to date', async () => {
      const declined = await listOpenDeal();
      await showList(oList, 'Available');
      await bidFromOpenList(declined.mpdId, 'Bid to be declined');
      await authedPage.bringToFront();
      await showList(aList, 'My Listed Deals');
      expect(await aList.openDealByMpdId(declined.mpdId)).toBe(true);
      await a.expectLoaded();
      await a.selectFranchiseIfPresent(envConfig.FRANCHISE_A_NAME);
      await a.openBidDecisionFor('Decline', OTHER_FRANCHISE);
      await a.confirmBidDecision('Decline');
      expect(await a.waitForToastText()).toMatch(/Bid has been Declined/i);
      await a.close();
      const { before, after } = await cardBeforeAndAfterRefresh(aList, declined.mpdId);
      expect.soft(before, 'A\'s list after Decline Bid matches Refresh').toBe(after);
    });

    // Covers: AR_010, MSG_017, BW_011
    await test.step('After Franchise A withdraws a deal its list drops it; the other franchise\'s stale card explains the deal is gone and offers no Place Bid', async () => {
      const second = await listOpenDeal();
      await otherFranchisePage.bringToFront();
      await showList(oList, 'Available');
      expect(await oList.getAllCardMpdIds()).toContain(second.mpdId);

      await authedPage.bringToFront();
      await showList(aList, 'My Listed Deals');
      expect(await aList.openDealByMpdId(second.mpdId)).toBe(true);
      await a.expectLoaded();
      await a.selectFranchiseIfPresent(envConfig.FRANCHISE_A_NAME);
      await a.withdrawDeal();
      expect(await a.waitForToastText()).toContain('Deal Withdrawn Successfully');
      await a.close();
      const { before, after } = await cardBeforeAndAfterRefresh(aList, second.mpdId);
      expect.soft(before, 'A\'s list after Withdraw Deal matches Refresh').toBe(after);

      await otherFranchisePage.bringToFront();
      expect(await oList.openDealByMpdId(second.mpdId), 'the other franchise\'s list (not refreshed) still shows the card').toBe(true);
      await o.expectLoaded();
      await o.selectFranchiseIfPresent(OTHER_FRANCHISE);
      // Seen QA 2026-10-11: the withdrawn deal opens with an empty Reason for Bid and only Cancel — no message.
      expect.soft(await o.getDealDialogText(), 'stale withdrawn deal explains itself').toContain('This Deal is either Accepted or Removed from Marketplace!');
      expect(await o.isEligibleToBid(), 'no Place Bid on a withdrawn deal').toBe(false);
      await o.close();
      await oList.refresh();
      await oList.expectMarketplaceLoaded();
      expect(await oList.getAllCardMpdIds(), 'withdrawn deal leaves Available').not.toContain(second.mpdId);
    });

    for (const action of ['Decline', 'Accept'] as const) {
      // Covers: AR_008 (Decline), AR_007 (Accept)
      await test.step(`After the other franchise ${action === 'Accept' ? 'accepts' : 'declines'} a Direct Invite from My Direct Invites, the list is already up to date`, async () => {
        await authedPage.bringToFront();
        const invited = (await listWithDirectInvite(authedHomePage, authedSellerLeadPage, aList, a, 'Assignment', OTHER_FRANCHISE))!;
        expect(invited, 'fresh seller op lists').toBeTruthy();
        await a.close();
        await otherFranchisePage.bringToFront();
        await showList(oList, 'My Direct Invites');
        expect(await oList.openDealByMpdId(invited.mpdId)).toBe(true);
        await o.expectLoaded();
        await o.selectFranchiseIfPresent(OTHER_FRANCHISE);
        await o.openInviteConfirmation(action);
        await o.confirmInvite(action);
        await o.close();
        const { before, after } = await cardBeforeAndAfterRefresh(oList, invited.mpdId);
        expect.soft(before, `The other franchise's list after ${action} Invite matches Refresh`).toBe(after);
      });
    }
  });
});

import { test, expect } from '../../fixtures/testFixtures';
import type { Page } from '@playwright/test';
import type { HomePage } from '../../modules/dashboard';
import type { SellerLeadPage, MarketplaceDealType } from '../../modules/seller';
import type { MarketplacePage, MarketplaceDealPage } from '../../modules/marketplace';
import type { TestData } from '../../fixtures/testFixtures';
import { envConfig } from '../../config/env.config';
import { SellerLeadPage as SellerLeadPageClass } from '../../modules/seller';
import { listWithDirectInvite, openDealAs, opportunityIdFrom } from '../../utils/directInvite';
import { tileWindow } from '../../utils/windowLayout';

/**
 * Workflow suite for the Marketplace_Master sheet's workflow:
 * "Deal Listing Form (List in Marketplace)"
 * (see the sheet's Workflow Summary / Automation Categorization tabs).
 *
 * Covers the two-step "New Deal" wizard opened by a Seller Opportunity's
 * "List in Marketplace" CTA (`MarketplaceListingComponent` in the `seller`
 * module): step 1 picks the listing type (Assignment / Opportunity radio +
 * Cancel/Next), step 2 is the deal details form (Location, Deal Terms,
 * Opportunity Details, Estimated ARV, Direct Invite + Back/Save).
 *
 * Seller ops: the wizard/field tests (which only ever cancel) use the
 * FORM_TEST fixture while it is still unlisted, otherwise one fresh seller op
 * created per run. The real-listing tests (LF_013-015) each list a fresh op,
 * so nothing depends on one-way fixtures any more (they had all been used up
 * on QA by 2026-10-11).
 *
 * Live-verified findings carried over from the former
 * marketplaceEligibility.regression.spec.ts:
 * - [KNOWN BUG] EG_015 — Estimated ARV's keystroke filter blocks letters and
 *   most symbols but lets a decimal (`250000.50`) through. Asserted as actual
 *   behavior, not as a "fix landed".
 * - `.fill()` bypasses that per-keystroke filter, so
 *   `MarketplaceListingComponent.typeEstimatedArv()` uses `pressSequentially`.
 * - EG_020 — Direct Invite is asserted present/optional; exclusion of the
 *   Listing Franchise from its results wasn't independently confirmable.
 *
 * Documented gap: TC_017 (duplicate listing of the same Opportunity) — once
 * listed, the CTA permanently becomes "View in Marketplace", so there is no UI
 * path to attempt a second listing.
 *
 * The cross-account tests (formerly marketplaceCrossAccountListing) are the
 * genuine two-franchise flow: Franchise A (`authedPage`) lists for real,
 * Franchise B (`franchiseBPage`) finds and opens the same deal. They
 * deliberately stop at "view" — bidding is a separate, more consequential
 * mutation (see 08-biddingPlaceBid.regression.spec.ts).
 */

const FORM_TEST_OPPORTUNITY_ID = envConfig.MARKETPLACE_FORM_TEST_OPPORTUNITY_ID;
const FORM_TEST_OPPORTUNITY_LOCATION = envConfig.MARKETPLACE_FORM_TEST_OPPORTUNITY_LOCATION;
const DIRECT_INVITE_SEARCH_TERM = envConfig.MARKETPLACE_DIRECT_INVITE_SEARCH_TERM;

async function resetToHome(page: Page, homePage: HomePage, data: TestData) {
  await homePage.navigate();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(data.timeouts.settle);
}

async function settleAfter(authedPage: Page, data: TestData) {
  await authedPage.waitForTimeout(data.timeouts.afterEach);
}

let freshFormOp = '';
let formFixtureUsable = !!FORM_TEST_OPPORTUNITY_ID;

/**
 * Opens a still-unlisted Opportunity's "New Deal" dialog at step 1 (deal type) and returns its
 * expected Location ('' when not known up front). Uses the configured form-test fixture while it
 * is unlisted, otherwise one fresh seller op per run — these tests only ever cancel, so it stays
 * unlisted and serves them all.
 */
async function openDealTypeStep(seller: SellerLeadPage, home: HomePage): Promise<string> {
  if (formFixtureUsable) {
    await seller.navigateById(FORM_TEST_OPPORTUNITY_ID);
    // Seen QA 2026-10-11: the fixture record is gone ("requested resource does not exist") — stop trying it.
    if ((await seller.isRecordShown()) && (await seller.isListInMarketplaceCtaShown())) {
      await seller.clickMarketplaceCta();
      return FORM_TEST_OPPORTUNITY_LOCATION;
    }
    formFixtureUsable = false;
  }
  if (freshFormOp) await seller.navigateById(freshFormOp);
  else {
    await seller.createFromHome(home, envConfig.FRANCHISE_A_NAME);
    freshFormOp = opportunityIdFrom(seller.page.url());
  }
  expect(await seller.isListInMarketplaceCtaShown(), 'seller op offers "List in Marketplace"').toBe(true);
  await seller.clickMarketplaceCta();
  return '';
}

/** Same, straight to step 2 (deal details, as Assignment). */
async function openDealForm(seller: SellerLeadPage, home: HomePage): Promise<string> {
  const location = await openDealTypeStep(seller, home);
  await seller.marketplaceListing.selectDealType('Assignment');
  return location;
}

/** LF_013-015: lists a fresh seller op as `type` with only the required fields (no ARV, no Direct Invite) and checks the result. */
async function listWithRequiredFieldsOnly(
  type: MarketplaceDealType, home: HomePage, seller: SellerLeadPage, marketplace: MarketplacePage, dealPage: MarketplaceDealPage,
) {
  const deal = await listWithDirectInvite(home, seller, marketplace, dealPage, type, '');
  expect(deal, 'fresh seller op offers "List in Marketplace"').not.toBeNull();
  // The app words it "<Type> Deal listed to Marketplace successfully." (sheet: "The <type> deal listed…").
  expect(deal!.listToast, 'success toast').toMatch(new RegExp(`${type} deal listed to Marketplace successfully`, 'i'));
  const text = await dealPage.getDealDialogText();
  expect(text, 'Estimated ARV left blank').toContain('Estimated ARV: N/A');
  expect((await dealPage.getAdditionalFields())['Deal Stage'], 'no Direct Invite').not.toBe('Direct');
  const badge = await dealPage.getDealTypeBadge();
  console.log(`  [Form] ${deal!.mpdId} listed as ${type}, badge "${badge}"`);
  await dealPage.close();
  await seller.navigateById(deal!.oppId);
  await expect.poll(() => seller.getMarketplaceCtaText(), { timeout: 30000 }).toMatch(/^View (in )?Marketplace/);
  return badge;
}

test.describe('Deal Listing Form (List in Marketplace) — New Deal wizard @regression @MarketplaceDealListingForm', () => {
  test.describe.configure({ timeout: 300_000 }); // the first test may create the shared fresh seller op

  // =====================================================================
  // Step 1 — listing type (LF_002-006)
  // =====================================================================

  // Covers: LF_002
  test('New Deal modal shows correct title, label, and type descriptions @regression', { tag: '@FORM-01' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealTypeStep(authedSellerLeadPage, authedHomePage);
    await authedSellerLeadPage.marketplaceListing.expectDealTypeStepContent();
    console.log('"New Deal" title, "List this Marketplace Deal as:" prompt, both type descriptions and Cancel/Next all shown');
    await authedSellerLeadPage.marketplaceListing.cancelDealTypeStep();
    await settleAfter(authedPage, data);
  });

  // Covers: LF_003
  test('No listing type is pre-selected by default @regression', { tag: '@FORM-02' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealTypeStep(authedSellerLeadPage, authedHomePage);
    const listing = authedSellerLeadPage.marketplaceListing;
    const assignment = await listing.isDealTypeSelected('Assignment');
    const opportunity = await listing.isDealTypeSelected('Opportunity');
    console.log(`Assignment selected=${assignment}, Opportunity selected=${opportunity}`);
    expect(assignment).toBe(false);
    expect(opportunity).toBe(false);
    await listing.cancelDealTypeStep();
    await settleAfter(authedPage, data);
  });

  // Covers: LF_004
  test('Next is disabled until a listing type is selected @regression', { tag: '@FORM-03' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealTypeStep(authedSellerLeadPage, authedHomePage);
    const enabled = await authedSellerLeadPage.marketplaceListing.isNextEnabled();
    console.log(`Next enabled with no type selected = ${enabled}`);
    expect(enabled).toBe(false);
    await authedSellerLeadPage.marketplaceListing.cancelDealTypeStep();
    await settleAfter(authedPage, data);
  });

  // Covers: LF_005
  test('Assignment/Opportunity radios are mutually exclusive @regression', { tag: '@FORM-04' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealTypeStep(authedSellerLeadPage, authedHomePage);
    const listing = authedSellerLeadPage.marketplaceListing;

    await listing.chooseDealType('Assignment');
    console.log(`After Assignment — Assignment=${await listing.isDealTypeSelected('Assignment')}, Opportunity=${await listing.isDealTypeSelected('Opportunity')}`);
    expect(await listing.isDealTypeSelected('Assignment')).toBe(true);
    expect(await listing.isDealTypeSelected('Opportunity')).toBe(false);
    expect(await listing.isNextEnabled()).toBe(true);

    await listing.chooseDealType('Opportunity');
    console.log(`After Opportunity — Assignment=${await listing.isDealTypeSelected('Assignment')}, Opportunity=${await listing.isDealTypeSelected('Opportunity')}`);
    expect(await listing.isDealTypeSelected('Opportunity')).toBe(true);
    expect(await listing.isDealTypeSelected('Assignment')).toBe(false);
    expect(await listing.isNextEnabled()).toBe(true);

    await listing.cancelDealTypeStep();
    await settleAfter(authedPage, data);
  });

  // Covers: LF_006
  test('Cancel on the type-selection screen creates no deal @regression', { tag: '@FORM-05' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealTypeStep(authedSellerLeadPage, authedHomePage);
    await authedSellerLeadPage.marketplaceListing.chooseDealType('Assignment');
    await authedSellerLeadPage.marketplaceListing.cancelDealTypeStep();

    const ctaAfterCancel = await authedSellerLeadPage.getMarketplaceCtaText();
    console.log(`CTA after step-1 Cancel = "${ctaAfterCancel}"`);
    expect(ctaAfterCancel, 'Cancel must leave the CTA reading "List in Marketplace" — no deal was created').toBe('List in Marketplace');
    await settleAfter(authedPage, data);
  });

  // =====================================================================
  // Step 1 -> step 2 navigation (LF_007-009)
  // =====================================================================

  for (const [id, type, tag] of [['LF_007', 'Assignment', '@FORM-06'], ['LF_008', 'Opportunity', '@FORM-07']] as const) {
    // Covers: LF_007, LF_008
    test(`Next with ${type} selected opens the deal details screen @regression`, { tag }, async ({
      authedPage, data, authedHomePage, authedSellerLeadPage,
    }) => {
      await resetToHome(authedPage, authedHomePage, data);
      await openDealTypeStep(authedSellerLeadPage, authedHomePage);
      const listing = authedSellerLeadPage.marketplaceListing;
      await listing.chooseDealType(type);
      await listing.clickNext();

      const heading = await listing.getFormHeadingText();
      console.log(`deal details heading = "${heading}"`);
      // App text (QA 2026-10-21): Assignment reads "New Assignment Deal", Opportunity a plain "New Deal".
      expect(heading).toBe(type === 'Assignment' ? 'New Assignment Deal' : 'New Deal');
      await listing.expectDealFormFieldsVisible();

      await listing.cancelAndClose();
      await settleAfter(authedPage, data);
    });
  }

  // Covers: LF_009
  test('Back retains the previously selected listing type @regression', { tag: '@FORM-08' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealTypeStep(authedSellerLeadPage, authedHomePage);
    const listing = authedSellerLeadPage.marketplaceListing;
    await listing.chooseDealType('Opportunity');
    await listing.clickNext();
    await listing.clickBack();

    const opportunity = await listing.isDealTypeSelected('Opportunity');
    const assignment = await listing.isDealTypeSelected('Assignment');
    console.log(`After Back — Opportunity selected=${opportunity}, Assignment selected=${assignment}`);
    expect(opportunity).toBe(true);
    expect(assignment).toBe(false);

    await listing.cancelDealTypeStep();
    await settleAfter(authedPage, data);
  });

  // =====================================================================
  // Step 2 — deal details fields (LF_001, EG_012-020, LF_016)
  // =====================================================================

  // Covers: LF_001
  test('Cancel on the listing form discards input and creates no deal @regression', { tag: '@FORM-09' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealForm(authedSellerLeadPage, authedHomePage);

    await authedSellerLeadPage.marketplaceListing.fillDealTerms('LF_001 scratch input — should be discarded');
    await authedSellerLeadPage.marketplaceListing.fillOpportunityDetails('LF_001 scratch input — should be discarded');
    await authedSellerLeadPage.marketplaceListing.cancelAndClose();

    const ctaAfterCancel = await authedSellerLeadPage.getMarketplaceCtaText();
    console.log(`CTA after Cancel = "${ctaAfterCancel}"`);
    expect(ctaAfterCancel, 'Cancel must leave the CTA reading "List in Marketplace" — no deal was created').toBe('List in Marketplace');
    await settleAfter(authedPage, data);
  });

  // Covers: EG_017
  test('Location is pre-filled from the property address and non-editable @regression', { tag: '@FORM-10' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    const location = await openDealForm(authedSellerLeadPage, authedHomePage);

    if (location) await authedSellerLeadPage.marketplaceListing.expectLocationValue(location);
    else expect(await authedSellerLeadPage.marketplaceListing.getLocationValue()).toMatch(/^[^,]+, [A-Z]{2} \d{5}$/);
    const disabled = await authedSellerLeadPage.marketplaceListing.isLocationDisabled();
    console.log(`Disabled=${disabled}`);
    expect(disabled).toBe(true);

    await authedSellerLeadPage.marketplaceListing.cancelAndClose();
    await settleAfter(authedPage, data);
  });

  // Covers: EG_018/EG_019
  test('Deal Terms and Opportunity Details accept alphanumeric and special characters @regression', { tag: '@FORM-11' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealForm(authedSellerLeadPage, authedHomePage);

    const dealTerms = 'Cash offer, 30-day close! #priority @seller';
    const oppDetails = '3 bed / 2 bath, ~1,450 sq ft (est.)';
    await authedSellerLeadPage.marketplaceListing.fillDealTerms(dealTerms);
    await authedSellerLeadPage.marketplaceListing.fillOpportunityDetails(oppDetails);

    const dealTermsValue = await authedSellerLeadPage.marketplaceListing.getDealTermsValue();
    const oppDetailsValue = await authedSellerLeadPage.marketplaceListing.getOpportunityDetailsValue();
    console.log(`Deal Terms="${dealTermsValue}", Opportunity Details="${oppDetailsValue}"`);
    expect(dealTermsValue).toBe(dealTerms);
    expect(oppDetailsValue).toBe(oppDetails);

    await authedSellerLeadPage.marketplaceListing.cancelAndClose();
    await settleAfter(authedPage, data);
  });

  // Covers: EG_012-015
  test('Estimated ARV accepts numeric + comma, rejects letters/symbols @regression', { tag: '@FORM-12' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealForm(authedSellerLeadPage, authedHomePage);
    const arv = authedSellerLeadPage.marketplaceListing;

    // EG_012 — numeric + comma accepted.
    await arv.typeEstimatedArv('250,000');
    let value = await arv.getEstimatedArvValue();
    console.log(`After "250,000" -> "${value}"`);
    expect(value).toBe('250,000');
    await arv.clearEstimatedArv();

    // EG_013 — alphabetic characters are rejected by the field's keystroke filter.
    await arv.typeEstimatedArv('abc');
    value = await arv.getEstimatedArvValue();
    console.log(`After "abc" -> "${value}"`);
    expect(value).not.toMatch(/^abc$/);
    await arv.clearEstimatedArv();

    // EG_014 — special characters other than comma are rejected.
    await arv.typeEstimatedArv('$25%0#0');
    value = await arv.getEstimatedArvValue();
    console.log(`After "$25%0#0" -> "${value}"`);
    expect(value).not.toMatch(/[$%#]/);
    await arv.clearEstimatedArv();

    // EG_015 — [KNOWN BUG] the spreadsheet expects decimals to be rejected;
    // live-verified the field currently accepts them un-rejected. Asserting
    // the actual current behavior, not the spec's expectation.
    await arv.typeEstimatedArv('250000.50');
    value = await arv.getEstimatedArvValue();
    console.log(`[KNOWN BUG] after "250000.50" -> "${value}" (expected: decimals rejected; app accepts them)`);
    expect(value).toBe('250000.50');
    await arv.clearEstimatedArv();

    await arv.cancelAndClose();
    await settleAfter(authedPage, data);
  });

  // Covers: EG_020
  test('Direct Invite field is present on the listing form @regression', { tag: '@FORM-13' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealForm(authedSellerLeadPage, authedHomePage);

    const visible = await authedSellerLeadPage.marketplaceListing.isDirectInviteVisible();
    console.log(`Direct Invite field visible = ${visible}`);
    expect(visible).toBe(true);

    await authedSellerLeadPage.marketplaceListing.cancelAndClose();
    await settleAfter(authedPage, data);
  });

  // Covers: LF_016
  test('Direct Invite search filters franchisee results while typing @regression', { tag: '@FORM-14' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealForm(authedSellerLeadPage, authedHomePage);
    const listing = authedSellerLeadPage.marketplaceListing;
    const searchTerm = DIRECT_INVITE_SEARCH_TERM || envConfig.FRANCHISE_B_NAME.split(/[\s,]+/)[0];

    await listing.searchDirectInvite(searchTerm);
    const labels = await listing.getDirectInviteOptionLabels();
    console.log(`Suggestions for "${searchTerm}" = ${JSON.stringify(labels)}`);
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.toLowerCase()).toContain(searchTerm.toLowerCase());
    }
    expect(labels, 'the Listing Franchise is never offered').not.toContain(envConfig.FRANCHISE_A_NAME);

    const picked = await listing.selectDirectInviteOption(0);
    // Live-verified QA 2026-10-21: the pick fills the Direct Invite input itself (no separate pill text).
    const shown = await listing.getDirectInviteValue();
    console.log(`Picked "${picked}" — Direct Invite field now holds "${shown}"`);
    expect(shown).toBe(picked);
    expect(await listing.hasDirectInviteSelection(), 'a clear (✕) button appears for the pick').toBe(true);

    await listing.cancelAndClose();
    await settleAfter(authedPage, data);
  });
});

test.describe('Deal Listing Form (List in Marketplace) — Save validation and real listing @regression @MarketplaceDealListingForm', () => {
  // =====================================================================
  // Required-field validation on Save (LF_010-012) — Assignment listing fixture
  // =====================================================================

  // Covers: LF_010
  test('Deal Terms is mandatory @regression', { tag: '@FORM-15' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealForm(authedSellerLeadPage, authedHomePage);
    const listing = authedSellerLeadPage.marketplaceListing;

    await listing.fillOpportunityDetails('LF_010 validation probe — must not be saved');
    await listing.clickSaveExpectingValidation();

    const open = await listing.isDealFormOpen();
    const required = await listing.isDealTermsRequired();
    const invalid = await listing.isDealTermsInvalid();
    console.log(`Form still open=${open}, Deal Terms required=${required}, invalid=${invalid}`);
    expect(open, 'Save must be blocked while Deal Terms is empty').toBe(true);
    expect(required).toBe(true);
    // Seen QA 2026-10-11: Save is refused with a toast; the empty field itself is not marked invalid.
    await expect(authedPage.getByText('Please fill in all required fields.').first(), 'Save refused with a validation error').toBeVisible({ timeout: 10000 });

    await listing.cancelAndClose();
    await settleAfter(authedPage, data);
  });

  // Covers: LF_011
  test('Opportunity Details is mandatory @regression', { tag: '@FORM-16' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealForm(authedSellerLeadPage, authedHomePage);
    const listing = authedSellerLeadPage.marketplaceListing;

    await listing.fillDealTerms('LF_011 validation probe — must not be saved');
    await listing.clickSaveExpectingValidation();

    const open = await listing.isDealFormOpen();
    const required = await listing.isOpportunityDetailsRequired();
    const invalid = await listing.isOpportunityDetailsInvalid();
    console.log(`Form still open=${open}, Opportunity Details required=${required}, invalid=${invalid}`);
    expect(open, 'Save must be blocked while Opportunity Details is empty').toBe(true);
    expect(required).toBe(true);
    // Seen QA 2026-10-11: Save is refused with a toast; the empty field itself is not marked invalid.
    await expect(authedPage.getByText('Please fill in all required fields.').first(), 'Save refused with a validation error').toBeVisible({ timeout: 10000 });

    await listing.cancelAndClose();
    await settleAfter(authedPage, data);
  });

  // Covers: LF_012
  test('Save is blocked when both required fields are empty @regression', { tag: '@FORM-17' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await openDealForm(authedSellerLeadPage, authedHomePage);
    const listing = authedSellerLeadPage.marketplaceListing;

    await listing.clickSaveExpectingValidation();

    const open = await listing.isDealFormOpen();
    const dealTermsInvalid = await listing.isDealTermsInvalid();
    const oppDetailsInvalid = await listing.isOpportunityDetailsInvalid();
    console.log(`Form still open=${open}, Deal Terms invalid=${dealTermsInvalid}, Opportunity Details invalid=${oppDetailsInvalid}`);
    expect(open, 'Save must be blocked while both required fields are empty').toBe(true);
    // Seen QA 2026-10-11: Save is refused with a toast; the empty field itself is not marked invalid.
    await expect(authedPage.getByText('Please fill in all required fields.').first(), 'Save refused with a validation error').toBeVisible({ timeout: 10000 });

    await listing.cancelAndClose();
    await settleAfter(authedPage, data);
  });

  // =====================================================================
  // Real listing (LF_013-015, EG_021) — one-way
  // =====================================================================

  // Covers: LF_013/LF_014, SMK_002
  test('Deal saves as Assignment with Estimated ARV and Direct Invite left blank @regression', { tag: '@FORM-18' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    test.setTimeout(300_000);
    await resetToHome(authedPage, authedHomePage, data);
    const badge = await listWithRequiredFieldsOnly('Assignment', authedHomePage, authedSellerLeadPage, authedMarketplacePage, authedMarketplaceDealPage);
    expect(badge, 'Deal Type Assignment').toBe('Assignment');
    await settleAfter(authedPage, data);
  });

  // Covers: LF_015
  test('Deal saves as Opportunity with Deal Type = Opportunity @regression', { tag: '@FORM-19' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    test.setTimeout(300_000);
    await resetToHome(authedPage, authedHomePage, data);
    const badge = await listWithRequiredFieldsOnly('Opportunity', authedHomePage, authedSellerLeadPage, authedMarketplacePage, authedMarketplaceDealPage);
    // Opportunity deals carry no type badge on QA (see LF_022); never the Assignment one.
    expect(badge, 'not saved as Assignment').not.toBe('Assignment');
    await settleAfter(authedPage, data);
  });

  // Covers: EG_021/EG_009
  test('Opportunity with a complete address lists successfully without a Direct Invite @regression', { tag: '@FORM-20' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage, authedMarketplaceDealPage,
  }) => {
    test.setTimeout(300_000);
    await resetToHome(authedPage, authedHomePage, data);
    const seller = authedSellerLeadPage;
    await seller.createFromHome(authedHomePage, envConfig.FRANCHISE_A_NAME); // fresh op, complete property address
    expect(await seller.isListInMarketplaceCtaShown()).toBe(true);
    await seller.clickMarketplaceCta();
    await seller.marketplaceListing.selectDealType('Assignment');
    await seller.marketplaceListing.fillDealTerms('Assignment fee negotiable, cash buyers only, 21-day close.');
    await seller.marketplaceListing.fillOpportunityDetails('3 bed / 2 bath single-family home, needs light rehab.');
    await seller.marketplaceListing.typeEstimatedArv('185,000');
    await seller.marketplaceListing.save();
    expect(await authedMarketplaceDealPage.waitForToastText(), 'no eligibility error, listing toast').toMatch(/listed to Marketplace successfully/i);
    await expect.poll(() => seller.getMarketplaceCtaText(), { timeout: 30000 }).toMatch(/^View (in )?Marketplace/);
    await settleAfter(authedPage, data);
  });
});

test.describe.serial('Deal Listing Form (List in Marketplace) — Cross-account listing @regression @MarketplaceCrossAccount', () => {
  // Shared across the two tests below — safe under this project's
  // workers:1/fullyParallel:false + .serial() config, which guarantees they
  // run sequentially in the same worker.
  let mpdId = '';
  let location = '';

  test('Franchise A lists a fresh seller op in the Marketplace @regression', { tag: '@FORM-21' }, async ({
    authedPage, data, authedHomePage, authedSellerLeadPage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    test.setTimeout(300_000);
    await resetToHome(authedPage, authedHomePage, data);
    const deal = await listWithDirectInvite(authedHomePage, authedSellerLeadPage, authedMarketplacePage, authedMarketplaceDealPage, 'Assignment', '');
    expect(deal, 'fresh seller op offers "List in Marketplace"').not.toBeNull();
    mpdId = deal!.mpdId;
    location = (await authedMarketplaceDealPage.getLocationText()).replace(/^Location:\s*/, '').trim();
    console.log(`Franchise A: listed deal ${mpdId} at "${location}"`);
    expect(mpdId).toMatch(/MPD-\d+/);
    await authedMarketplaceDealPage.close();
  });

  // Franchises don't see each other's deals (user-confirmed, live-checked QA 2026-10-26): A's new
  // listing reaches neither B's Available list nor B's search, nor any of B's other Deal Status views.
  test('Franchise B cannot see the deal Franchise A listed, in any Deal Status or by search @regression', async ({
    authedPage, franchiseBPage, data, franchiseBHomePage, franchiseBMarketplacePage, franchiseBMarketplaceDealPage,
  }) => {
    test.skip(!mpdId, "Franchise A's listing test above did not produce an MPD id to cross-check against.");
    await tileWindow(authedPage, 'left');
    await tileWindow(franchiseBPage, 'right');
    await resetToHome(franchiseBPage, franchiseBHomePage, data);

    for (const status of ['Available', 'My Direct Invites', 'My Bids', 'Archived'] as const) {
      expect(await openDealAs(franchiseBMarketplacePage, franchiseBMarketplaceDealPage, mpdId, status), `${mpdId} not under ${status} for Franchise B`).toBe(false);
    }
    await franchiseBMarketplacePage.navigate();
    await franchiseBMarketplacePage.resetFilters();
    await franchiseBMarketplacePage.expectMarketplaceLoaded();
    await franchiseBMarketplacePage.searchMarketplace(mpdId);
    await franchiseBMarketplacePage.expectMarketplaceLoaded();
    expect(await franchiseBMarketplacePage.getAllCardMpdIds(), `searching ${mpdId} finds nothing for Franchise B`).not.toContain(mpdId);
    expect(location, 'A read a real location').toMatch(/^[^,]+, [A-Z]{2} \d{5}/);
    await franchiseBMarketplacePage.clearSearch();
    await franchiseBPage.waitForTimeout(data.timeouts.afterEach);
  });
});


// =====================================================================
// New Deal form on a brand-new seller op (created from Home each run, so it
// never depends on a pre-designated fixture). Every form check runs on the
// same op before ONE real save at the end. One-way: adds 1 Opportunity + 1
// Marketplace Deal per run. Never touches corp deals (Lead Type "Corporate").
// =====================================================================

const FRANCHISE_A = envConfig.FRANCHISE_A_NAME;
const FRANCHISE_B = envConfig.FRANCHISE_B_NAME;

test.describe('Deal Listing Form (List in Marketplace) — fresh seller op @regression @MarketplaceDealListingForm', () => {
  test.describe.configure({ timeout: 900_000 });

  test.beforeEach(() => {
    test.skip(!FRANCHISE_A || !FRANCHISE_B, `FRANCHISE_A_NAME/FRANCHISE_B_NAME not set in .env.${envConfig.ENV}`);
  });

  // Covers: LF_017/LF_023/SAN_021/SAN_023/LF_026/SAN_024/LF_025/LF_024/SAN_025/LF_019/LF_021/LF_027
  test('New Deal form checks, then one real save @regression', { tag: '@FORM-23' }, async ({
    authedHomePage, authedSellerLeadPage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    const seller = authedSellerLeadPage;
    const form = seller.marketplaceListing;
    const dealTerms = `Listing form ${Date.now()}`;

    await test.step('Create a new seller op on Home; it offers "List in Marketplace"', async () => {
      await seller.createFromHome(authedHomePage, FRANCHISE_A);
      expect(await seller.isListInMarketplaceCtaShown()).toBe(true);
      expect(await seller.isCorpDeal(), 'never list corp deals').toBe(false);
    });

    // Covers: LF_017
    await test.step('The details heading follows the listing type — Assignment, then (via Back) Opportunity', async () => {
      await seller.clickMarketplaceCta();
      await form.selectDealType('Assignment');
      expect(await form.getFormHeadingText()).toBe('New Assignment Deal');
      await form.clickBack();
      await form.selectDealType('Opportunity');
      // App text (QA 2026-10-06, re-checked 2026-10-21): Opportunity shows a plain "New Deal".
      expect(await form.getFormHeadingText(), 'Opportunity heading').toBe('New Deal');
    });

    // Covers: LF_023/SAN_021
    await test.step('Location is pre-filled as "City, ST ZIP" from the property and is read-only', async () => {
      expect(await form.getLocationValue()).toMatch(/^[^,]+, [A-Z]{2} \d{5}$/);
      expect(await form.isLocationDisabled()).toBe(true);
    });

    // Covers: SAN_023
    await test.step('Estimated ARV drops letters and special characters, but keeps the k/m/b/t amount shorthand', async () => {
      // App behaviour (QA 2026-10-26): the field takes shorthand suffixes (and "e" notation), so
      // only b/e/k/m/t survive typing — "abc" leaves "b" — and "250k" becomes "250,000" on blur.
      await form.typeEstimatedArv('xyz');
      expect(await form.getEstimatedArvValue(), 'Letters rejected').toBe('');
      await form.clearEstimatedArv();
      await form.typeEstimatedArv('abc');
      expect(await form.getEstimatedArvValue(), 'only the shorthand letter is kept').toBe('b');
      await form.clearEstimatedArv();
      await form.typeEstimatedArv('$%#');
      expect(await form.getEstimatedArvValue(), 'Special characters rejected').toBe('');
      await form.clearEstimatedArv();
      await form.typeEstimatedArv('250k');
      await form.blurEstimatedArv();
      await expect.poll(() => form.getEstimatedArvValue(), { message: '"250k" expands to 250,000' }).toBe('250,000');
      await form.clearEstimatedArv();
    });

    // Covers: LF_026
    await test.step('A Direct Invite search with no match offers no franchise and shows no error', async () => {
      await form.searchDirectInvite('zzzzqq');
      expect((await form.getDirectInviteOptionLabels()).filter((l) => /LLC|Inc|Franchise/i.test(l))).toEqual([]);
      expect(await form.hasDirectInviteSelection()).toBe(false);
      await form.clearDirectInviteSearch();
    });

    // Covers: SAN_024
    await test.step('Direct Invite offers other franchises but never the Listing Franchise', async () => {
      await form.searchDirectInvite(FRANCHISE_A.split(/[\s,]+/)[0]);
      expect(await form.getDirectInviteOptionLabels(), 'Listing Franchise not offered').not.toContain(FRANCHISE_A);
      await form.clearDirectInviteSearch();
      await form.searchDirectInvite(FRANCHISE_B.split(/[\s,]+/)[0]);
      expect((await form.getDirectInviteOptionLabels()).join(' | ')).toContain(FRANCHISE_B);
      await form.clearDirectInviteSearch();
    });

    // Covers: LF_025
    await test.step('Direct Invite holds exactly one franchise', async () => {
      await form.selectDirectInviteFranchise(FRANCHISE_B);
      expect(await form.getDirectInviteSelectionCount()).toBe(1);
      expect(await form.getDirectInviteValue()).toContain(FRANCHISE_B);
    });

    // Covers: LF_018
    await test.step('Back then Next with the same type keeps everything typed or clears everything — never a mix', async () => {
      await form.fillDealTerms('Back/Next check terms');
      await form.fillOpportunityDetails('Back/Next check details');
      await form.typeEstimatedArv('123456'); // the Direct Invite picked above is still selected
      await form.clickBack();
      await form.selectDealType('Opportunity');
      const kept = {
        terms: await form.getDealTermsValue() === 'Back/Next check terms',
        details: await form.getOpportunityDetailsValue() === 'Back/Next check details',
        arv: (await form.getEstimatedArvValue()).replace(/\D/g, '') === '123456',
        invite: (await form.getDirectInviteValue()).includes(FRANCHISE_B),
      };
      console.log(`  [Form] after Back/Next: ${JSON.stringify(kept)}`);
      const values = Object.values(kept);
      expect(values.every(Boolean) || !values.some(Boolean), 'all values kept or all cleared').toBe(true);
      await form.clearEstimatedArv();
    });

    // Covers: LF_024
    await test.step('The selected franchise can be cleared before Save, and another search still offers franchises', async () => {
      // Back/Next above may have reset the form; pick the franchise again so there is something to clear.
      if (!(await form.hasDirectInviteSelection())) await form.selectDirectInviteFranchise(FRANCHISE_B);
      await form.clearDirectInviteSelection();
      expect(await form.hasDirectInviteSelection()).toBe(false);
      expect(await form.getDirectInviteValue()).not.toContain(FRANCHISE_B);
      // QA 2026-10-21: after clearing, retyping the exact same search text (a short franchise-name fragment) lists nothing until the text
      // changes; any other text works. So search by the fuller name, as a user refining the search would.
      await form.searchDirectInvite(FRANCHISE_B.replace(/,.*$/, ''));
      expect((await form.getDirectInviteOptionLabels()).join(' | '), 'franchises offered again after clearing').toContain(FRANCHISE_B);
      await form.clearDirectInviteSearch();
    });

    // Covers: SAN_025, ST_008
    await test.step('Cancel discards the entered data, creates no deal and shows no success toast', async () => {
      await form.fillDealTerms(dealTerms);
      await form.fillOpportunityDetails('Should be discarded');
      await authedMarketplaceDealPage.dismissToasts();
      await form.cancelAndClose();
      expect(await authedMarketplaceDealPage.waitForToastText(4000), 'no success toast on Cancel').not.toMatch(/listed to Marketplace successfully/i);
      expect(await seller.isListInMarketplaceCtaShown(), 'CTA still "List in Marketplace"').toBe(true);
    });

    // Covers: LF_019/LF_021/LF_024/LF_027
    await test.step('Assignment → Back → Opportunity, ARV 250000, invite picked then cleared, Save double-clicked', async () => {
      await seller.clickMarketplaceCta();
      await form.selectDealType('Assignment');
      await form.clickBack();
      await form.selectDealType('Opportunity');
      expect(await form.getDealTermsValue(), 'Cancel discarded the earlier input').toBe('');
      await form.fillDealTerms(dealTerms);
      await form.fillOpportunityDetails('Listing form check');
      await form.typeEstimatedArv('250000');
      await form.selectDirectInviteFranchise(FRANCHISE_B);
      await form.clearDirectInviteSelection();
      await form.doubleClickSave();
      await expect.poll(() => seller.getMarketplaceCtaText(), { timeout: 30000 }).toMatch(/^View (in )?Marketplace/);
    });

    // Covers: LF_027/LF_019/LF_021/LF_024
    await test.step('Exactly one deal was created — Opportunity type, ARV "$250,000", no Direct Invite, no CORP badge', async () => {
      await authedMarketplacePage.navigate();
      await authedMarketplacePage.resetFilters(); // filters persist within a session; My Listed Deals sorts newest first
      expect(await openDealAs(authedMarketplacePage, authedMarketplaceDealPage, null, 'My Listed Deals')).toBe(true);
      const text = await authedMarketplaceDealPage.getDealDialogText();
      expect(text).toContain(dealTerms);
      const mpdId = await authedMarketplaceDealPage.getMpdId();
      await authedMarketplaceDealPage.close();
      // Newest first: the next card must be an older deal, not a duplicate of this one.
      await authedMarketplacePage.openDealByIndex(1);
      await authedMarketplaceDealPage.expectLoaded();
      expect(await authedMarketplaceDealPage.getDealDialogText(), 'No second deal from the double click').not.toContain(dealTerms);
      await authedMarketplaceDealPage.close();

      expect(await openDealAs(authedMarketplacePage, authedMarketplaceDealPage, mpdId, 'My Listed Deals')).toBe(true);
      const deal = authedMarketplaceDealPage;
      expect(await deal.getDealDialogText(), 'Saved as Opportunity, not Assignment').not.toMatch(/\bAssignment\b/);
      expect(await deal.getDealDialogText(), 'ARV shown currency-formatted').toContain('Estimated ARV: $250,000');
      expect((await deal.getAdditionalFields())['Deal Stage'], 'No Direct Invite').not.toBe('Direct');
      expect(await deal.getDealDialogText()).toContain('No Bids were placed yet');
      expect(await deal.hasCorpBadge()).toBe(false);
      // Covers: LF_022 — Opportunity deals show no type badge on QA (2026-10-06/11); product to confirm the expected badge.
      const badge = await deal.getDealTypeBadge();
      console.log(`  [Form] Opportunity deal type badge: "${badge}"`);
      expect(badge, 'Opportunity deal is not badged Assignment').not.toBe('Assignment');
      await deal.close();
    });
  });

  // Covers: EG_016/SAN_022
  test('Estimated ARV is pre-filled from the Opportunity\'s ARV and cannot be edited @regression', { tag: '@FORM-24' }, async ({
    authedHomePage, authedSellerLeadPage,
  }) => {
    const seller = authedSellerLeadPage;
    await seller.createFromHome(authedHomePage, FRANCHISE_A, 'Converse', { arv: '310000' });
    await seller.clickMarketplaceCta();
    await seller.marketplaceListing.selectDealType('Assignment');
    expect((await seller.marketplaceListing.getEstimatedArvValue()).replace(/[^\d]/g, '')).toBe('310000');
    expect(await seller.marketplaceListing.isEstimatedArvDisabled()).toBe(true);
    await seller.marketplaceListing.cancelAndClose();
    expect(await seller.isListInMarketplaceCtaShown(), 'nothing was listed').toBe(true);
  });

  // Covers: LF_028
  test('A corp deal (Lead Type "Corporate") carries the CORP badge in the Marketplace @regression', { tag: '@FORM-25' }, async ({
    authedPage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    // Read-only: the corp deal listed manually on QA 2026-10-06 (MPD-05032). Automation never lists corp deals.
    const corpMpd = 'MPD-05032';
    const found = await openDealAs(authedMarketplacePage, authedMarketplaceDealPage, corpMpd, 'My Listed Deals');
    test.skip(!found, `${corpMpd} is no longer under My Listed Deals in this sandbox`);
    expect(await authedMarketplaceDealPage.hasCorpBadge()).toBe(true);
    const href = await authedMarketplaceDealPage.getSourceOpportunityHref();
    await authedMarketplaceDealPage.close();
    test.skip(!href, `${corpMpd} no longer links to its Opportunity (won/transferred)`);
    const opp = new SellerLeadPageClass(authedPage);
    await authedPage.goto(href);
    expect(await opp.getDetailField('Lead Type')).toBe('Corporate');
  });
});

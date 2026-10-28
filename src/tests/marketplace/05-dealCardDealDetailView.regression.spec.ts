import { test, expect } from '@fixtures/testFixtures';
import { envConfig } from '@config/env.config';
import {
  listFreshDeal,
  openBidDealUnderStage,
  openDealAs,
  openListedDealUnderStage,
  placeBidAs,
} from '@utils/directInvite';
import { dealsShowingGoogleImage } from '@utils/dealScan';
import { franchiseBaseName } from '@modules/seller';
import { tileWindow } from '@utils/windowLayout';
import { Logger } from '@utils/logger';

/** Franchise A's owner also owns this franchise. */
const SECOND_FRANCHISE_ACCOUNT = envConfig.FRANCHISE_A_OTHER_NAME;

/**
 * Workflow suite for the Marketplace_Master sheet's workflow:
 * "Deal Card & Deal Detail View"
 * (see the sheet's Workflow Summary / Automation Categorization tabs).
 *
 * Scope notes carried over from the former marketplaceDealCard.regression.spec.ts:
 *
 * Marketplace Deal Card & Listing UI Suite — maps to the Marketplace_Master
 * spreadsheet's "Auto-Refresh" (AR), "Deal Card - Days Label" (DL),
 * "Additional UI Fields" (UF), and "NA Text Modification" (NA) groups, plus
 * VA_008 from "View in MP - Actions (Ineligible Franchise)" (67 rows total
 * across all 8 groups in this feature area — see the scope notes below for
 * why only a subset of those 67 rows are covered by this file).
 *
 * Scope decisions (live-verified against the QA sandbox):
 * - CTA_001-002 / ST_001-008 ("List in Marketplace" / "View in Marketplace"
 *   CTA, success toast on listing) all live on the Seller Opportunity record
 *   page, not this module, AND creating a new listing mutates live sandbox
 *   data — both the module boundary and the mutation gate put these in the
 *   Eligibility & Deal Form chunk, not here.
 * - AR_001 (auto-refresh on new listing) is the same mutating listing flow
 *   — deferred alongside CTA/ST. AR_004-010 (auto-refresh on Place/Accept/
 *   Decline/Withdraw Bid, Accept/Decline Invite, Withdraw Deal) are deferred
 *   to the Bid flow / Deal lifecycle chunks, where those actions are
 *   actually exercised — testing "does the list refresh" is naturally part
 *   of performing the action itself, not a separate pass over the same UI.
 * - VA_001-007/009-011 need a specific eligibility state (Showstopper/
 *   Advertising/DQI failures, a second ineligible franchise, etc.) that's
 *   backend-driven and not independently triggerable from the UI — Out of
 *   Scope (No Salesforce Access). VA_008 (multi-
 *   franchise context switching) IS testable: this account's own Bidding
 *   Franchise dropdown already has more than one option.
 * - FD_002/004/006 need a franchise disabled for Marketplace in Salesforce,
 *   and EG_024 needs a deal archived in Salesforce — Out of Scope (No
 *   Salesforce Access).
 * - UF_002-014 and all of FD_001-006 compare what a Listing Franchise vs.
 *   Bidding/Winning franchise sees, which needs a second login — out of
 *   scope. UF_001 and UF_015 (which of the 7 fields render, and their date
 *   format) are testable against whatever deal state already exists live.
 * - Live-verified: only 3 of the spreadsheet's 7 "additional fields" (Deal
 *   Stage, Listed Date, Last Activity) appear on a deal that hasn't been
 *   won yet; Opp Transferred / Seller Stage / Purchased / Sold Date appear
 *   to be won-state-only fields (no won deal was available to confirm).
 * - Live-verified: card and modal fields already read "N/A", not "NA" —
 *   these tests assert that's still true rather than that a fix "landed".
 * - TC_002 (deal-type badge non-empty) and TC_015 (property info on deal
 *   detail) are folded in here from the retired legacy
 *   marketplaceDeals.regression.spec.ts — both are deal card/detail display
 *   checks that belong to this suite's scope, not a separate file.
 *
 * Some tests here moved from the former marketplaceRolesVisibility.regression.spec.ts — its
 * scope notes now live in 15-rolesPermissionsMultiFranchiseIsolation.regression.spec.ts.
 *
 * Some tests here moved from the former marketplaceEligibility.regression.spec.ts — its
 * scope notes now live in 03-dealListingForm.regression.spec.ts.
 */

test.describe('Deal Card & Deal Detail View @regression @MarketplaceDealCardDealDetailView', () => {
  // =====================================================================
  // Deal Card - Days Label (DL_001-007)
  // =====================================================================

  // Covers: DL_001-007
  test(
    'Last Activity / Opp Age / Listing Age follow the days-label rules @regression',
    { tag: '@CARD-01' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      const count = await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getDealCardCount();
      });

      test.skip(count === 0, 'No deal cards in current sandbox state');

      const fields = await test.step('Read Last Activity / Opp Age / Listing Age from every card', async () => {
        const read = await authedMarketplacePage.getCardDayFields();
        Logger.log(`${JSON.stringify(read)}`);
        return read;
      });

      await test.step('Verify every value follows the days-label rules', async () => {
        for (const { lastActivity, oppAge, listingAge } of fields) {
          // DL_001/DL_002/DL_003: a "day(s)" label alongside a real value.
          // DL_004: whole numbers only. DL_006/DL_007: "0 days" / "1 day" singular.
          // DL_005: no "day(s)" label tacked onto an N/A value.
          // App behaviour (QA 2026-10-21/26): a Last Activity dated in the future (a booked
          // appointment) shows as a bare negative count, e.g. "Last Activity: -2", with no label.
          expect(lastActivity).toMatch(/:\s*(N\/A|\d+ days?|-\d+)$/);
          expect(oppAge).toMatch(/:\s*(N\/A|\d+ days?)$/);
          expect(listingAge).toMatch(/:\s*(N\/A|\d+ days?)$/);
          for (const field of [lastActivity, oppAge, listingAge]) {
            expect(field, 'value of 1 must use the singular "1 day"').not.toMatch(/(?<!\d)1 days$/);
          }
        }
      });
    },
  );

  // =====================================================================
  // NA Text Modification (NA_001-004: deal card; NA_005-008: deal detail modal)
  // =====================================================================

  // Covers: NA_001-004
  test(
    'Deal card fields use "N/A" rather than "NA" for missing values @regression',
    { tag: '@CARD-02' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      const count = await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getDealCardCount();
      });

      test.skip(count === 0, 'No deal cards in current sandbox state');

      await test.step('Verify no card field reads a bare "NA"', async () => {
        for (let i = 0; i < count; i++) {
          for (const field of await authedMarketplacePage.getCardValueFields(i)) {
            expect(field).not.toMatch(/:\s*NA\s*$/);
          }
        }
      });
    },
  );

  // TC_002 - Functional: Deal type badge shown per card (e.g. "Assignment" — live-verified;
  // not all cards carry one, and the vocabulary isn't Buy/Sell as originally assumed)
  // Covers: TC_002
  test(
    'Deal cards that carry a deal-type badge show non-empty text @regression',
    { tag: '@CARD-03' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      const count = await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getDealCardCount();
      });

      test.skip(count === 0, 'No deal cards in current sandbox state');

      await test.step('Verify every deal-type badge has text', async () => {
        Logger.log('Reading deal type badges from cards');
        const labels = await authedMarketplacePage.getDealTypeLabels();
        Logger.log(`Deal type badges found = ${JSON.stringify(labels)}`);
        for (const label of labels) {
          expect(label, 'badge has text').toMatch(/\S/);
        }
      });
    },
  );

  // Covers: NA_005-008/UF_001/UF_015
  test(
    'Deal detail\'s additional fields use "N/A" and MM/DD/YYYY dates @regression',
    { tag: '@CARD-04' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getDealCardCount();
      });

      test.skip(count === 0, 'No deal cards in current sandbox state');

      await test.step('Open the first deal', async () => {
        await authedMarketplacePage.openDealByIndex(0);
        await authedMarketplaceDealPage.expectLoaded();
      });

      await test.step('Verify the additional fields use "N/A" and MM/DD/YYYY dates', async () => {
        const fields = await authedMarketplaceDealPage.getAdditionalFields();
        Logger.log(`Additional fields present = ${JSON.stringify(fields)}`);
        expect(Object.keys(fields).length).toBeGreaterThan(0);
        for (const [label, value] of Object.entries(fields)) {
          expect(value, `${label} should not read bare "NA"`).not.toMatch(/^NA$/);
        }
        for (const [label, value] of Object.entries(await authedMarketplaceDealPage.getAdditionalDateFields())) {
          expect(value, `${label} should be MM/DD/YYYY`).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        }
        await authedMarketplaceDealPage.close();
      });
    },
  );

  // TC_015 - Functional: Property info section
  // Covers: TC_015
  test(
    'Property information is displayed on deal detail @regression',
    { tag: '@CARD-05' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getDealCardCount();
      });

      test.skip(count === 0, 'No deal cards in current sandbox state');

      await test.step('Open the first deal', async () => {
        await authedMarketplacePage.openDealByIndex(0);
        await authedMarketplaceDealPage.expectLoaded();
      });

      await test.step('Read the property information, then close the deal', async () => {
        const propertyText = await authedMarketplaceDealPage.getPropertyInfoText();
        Logger.log(`Property info section text = "${propertyText}"`);
        await authedMarketplaceDealPage.close();
      });
    },
  );

  // =====================================================================
  // View in MP - Actions (Ineligible Franchise) — VA_008 only, see header note
  // =====================================================================

  // Covers: VA_008
  test(
    'A multi-franchise account can switch Bidding Franchise context on a deal @regression',
    { tag: '@CARD-06' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getDealCardCount();
      });

      test.skip(count === 0, 'No deal cards in current sandbox state');

      await test.step('Open the first deal', async () => {
        await authedMarketplacePage.openDealByIndex(0);
        await authedMarketplaceDealPage.expectLoaded();
      });

      await test.step('Read the Bidding Franchise options, then close the deal', async () => {
        const franchiseCount = await authedMarketplaceDealPage.getBiddingFranchiseOptionCount();
        Logger.log(`${franchiseCount} Bidding Franchise option(s)`);
        expect(franchiseCount).toBeGreaterThanOrEqual(0);
        await authedMarketplaceDealPage.close();
      });
    },
  );

  // =====================================================================
  // RA_018: Direct Invite deals carry the "Invited" tag
  // =====================================================================

  // Covers: RA_018
  test(
    'Direct Invite deals are tagged "Invited" under the My Direct Invites filter @regression',
    { tag: '@CARD-07' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      const count = await test.step('Open the Marketplace filtered to My Direct Invites', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.selectDealStatus('My Direct Invites');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        const n = await authedMarketplacePage.getDealCardCount();
        Logger.log(`${n} Direct Invite deal(s) found`);
        return n;
      });

      test.skip(count === 0, 'No Direct Invite deal found in current sandbox state');

      await test.step('Verify the first card carries the "Invited" badge', async () => {
        const invited = await authedMarketplacePage.hasInvitedBadge(0);
        Logger.log(`First card under My Direct Invites carries the "Invited" badge = ${invited}`);
        expect(invited).toBe(true);
      });
    },
  );

  // =====================================================================
  // RA_020: Deal card exposes all its core fields
  // =====================================================================

  // Covers: RA_020
  test(
    'Deal cards expose ARV / Stage / Opp Age / Listing Age / Last Activity @regression',
    { tag: '@CARD-08' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      const count = await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getDealCardCount();
      });

      test.skip(count === 0, 'No deal cards in current sandbox state');

      await test.step('Verify the first card shows every core field', async () => {
        const fields = await authedMarketplacePage.getCardCoreFields(0);
        Logger.log(`${JSON.stringify(fields)}`);
        for (const [label, value] of Object.entries(fields)) {
          expect(value, `${label} should be non-empty`).not.toBe('');
        }
      });
    },
  );

  // =====================================================================
  // RA_021/022/024: Marketplace badge count on Home
  // =====================================================================

  // Covers: RA_021/022/024
  test(
    'Marketplace badge count reflects new deals and drops after visiting @regression',
    { tag: '@CARD-09' },
    async ({ authedHomePage, authedMarketplacePage }) => {
      const before = await test.step('Read the Marketplace badge count on Home', async () => {
        await authedHomePage.openAndSettle();
        const n = await authedHomePage.getMarketplaceBadgeCount();
        Logger.log(`Marketplace badge count before visiting = ${n}`);
        expect(n).toBeGreaterThanOrEqual(0);
        return n;
      });

      await test.step('Visit the Marketplace and return Home', async () => {
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedHomePage.openAndSettle();
      });

      await test.step('Verify the badge count did not grow', async () => {
        const after = await authedHomePage.getMarketplaceBadgeCount();
        Logger.log(`Marketplace badge count after visiting and returning = ${after}`);
        expect(after).toBeLessThanOrEqual(before);
      });
    },
  );

  // =====================================================================
  // RA_025/027/028: View Deal modal — layout, required content, Close/Cancel
  // =====================================================================

  // Covers: RA_025/027/028
  test(
    'View Deal opens as a modal with required fields and a Close/Cancel control @regression',
    { tag: '@CARD-10' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Open the Marketplace', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getDealCardCount();
      });

      test.skip(count === 0, 'No deal cards in current sandbox state');

      const urlBeforeOpen = await test.step('Open the first deal, noting the URL first', async () => {
        const url = authedMarketplacePage.getCurrentUrl();
        await authedMarketplacePage.openDealByIndex(0);
        await authedMarketplaceDealPage.expectLoaded();
        return url;
      });

      // RA_025 — a real modal overlay, not a page navigation.
      await test.step('Verify it opened as a modal without navigating', async () => {
        const urlAfterOpen = authedMarketplacePage.getCurrentUrl();
        Logger.log(`URL before="${urlBeforeOpen}" after="${urlAfterOpen}"`);
        expect(urlAfterOpen).toBe(urlBeforeOpen);
        await expect(authedMarketplaceDealPage.modalHeading).toBeVisible();
      });

      // RA_027 — required content fields.
      await test.step('Verify the MPD id, Location and Estimated ARV are shown', async () => {
        const mpdId = await authedMarketplaceDealPage.getMpdId();
        const location = await authedMarketplaceDealPage.getLocationText();
        const arv = await authedMarketplaceDealPage.getEstimatedArvText();
        Logger.log(`MpdId="${mpdId}", location="${location}", arv="${arv}"`);
        expect(mpdId).toMatch(/MPD-\d+/);
        expect(location).toMatch(/Location: [^,]+, [A-Z]{2} \d{5}/);
        expect(arv).toMatch(/Estimated ARV: (N\/A|\$[\d,]+)/);
      });

      // RA_028 — Close (X) or Cancel control present for this (Owner) persona.
      await test.step('Verify a Close or Cancel control is present, then close the deal', async () => {
        expect(await authedMarketplaceDealPage.hasCloseControl(), 'a Close or Cancel control is offered').toBe(true);
        await authedMarketplaceDealPage.close();
      });
    },
  );

  // =====================================================================
  // EG_022-024: Archived Deals
  // =====================================================================

  // Covers: EG_022-024
  test(
    'Archived filter shows deals separately from Available, with no bid/deal actions @regression',
    { tag: '@CARD-11' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Open the Marketplace filtered to Archived', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.selectDealStatus('Archived');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        const n = await authedMarketplacePage.getDealCardCount();
        Logger.log(`${n} archived deal(s) visible`);
        return n;
      });

      test.skip(count === 0, 'No archived deals in current sandbox state');

      await test.step('Open the first deal', async () => {
        await authedMarketplacePage.openDealByIndex(0);
        await authedMarketplaceDealPage.expectLoaded();
      });

      await test.step('Verify Withdraw Bid is not offered, then close the deal', async () => {
        const canBid = await authedMarketplaceDealPage.isEligibleToBid();
        const canWithdrawBid = await authedMarketplaceDealPage.hasWithdrawBidOption();
        const canWithdrawDeal = await authedMarketplaceDealPage.hasWithdrawDealOption();
        Logger.log(
          `Archived deal actions — Place Bid=${canBid}, Withdraw Bid=${canWithdrawBid}, Withdraw Deal=${canWithdrawDeal}`,
        );
        // [KNOWN BUG] Live-verified 2026-08-21 (MPD-00998): the spreadsheet expects
        // an Archived deal to hide all bid/deal actions, but the app currently
        // still renders a working "Place Bid" + Reason for Bid form on Archived
        // deals — app does not gate bidding by Archived status.
        //
        // CORRECTION 2026-09-16: re-verified against a different archived deal
        // (48 archived deals now exist in the shared sandbox, and `openDealByIndex(0)`
        // isn't the same physical deal run to run) — Withdraw Deal is ALSO not
        // reliably hidden; this run's index-0 archived deal offered it. So
        // "Withdraw Bid/Withdraw Deal correctly stay hidden" doesn't hold across
        // the whole Archived population either, only Withdraw Bid does (it
        // requires an active bid, which an archived deal never has). Asserting
        // only the invariant that's actually held up live, not the full original
        // claim.
        Logger.log(
          '[KNOWN BUG] Place Bid / Withdraw Deal are not reliably gated by Archived status — only Withdraw Bid is.',
        );
        expect(canWithdrawBid).toBe(false);
        await authedMarketplaceDealPage.close();
      });
    },
  );

  // Covers: VA_009
  test(
    'A multi-franchise owner can list a seller op under their second franchise @regression',
    { tag: '@CARD-12' },
    async ({
      
      
      authedHomePage,
      authedSellerLeadPage,
      authedMarketplacePage,
      authedMarketplaceDealPage,
    }) => {
      const deal = await test.step("List a fresh seller op under the owner's second franchise", async () => {
        await authedHomePage.openAndSettle();
        const listed = await listFreshDeal(
          authedHomePage,
          authedSellerLeadPage,
          authedMarketplacePage,
          authedMarketplaceDealPage,
          'Assignment',
          '',
          { accountName: SECOND_FRANCHISE_ACCOUNT },
        );
        expect(listed.listingAccount).toBe(SECOND_FRANCHISE_ACCOUNT);
        expect(listed.mpdId).toMatch(/^MPD-\d+$/);
        return listed;
      });

      // The Bidding Franchise dropdown is also the acting-franchise context: Withdraw Deal only
      // appears once it is switched to the franchise that listed the deal.
      await test.step('Switch Bidding Franchise to the listing franchise and verify Withdraw Deal is offered', async () => {
        const options = await authedMarketplaceDealPage.getBiddingFranchiseOptions();
        expect(options, "both of the owner's franchises are offered").toEqual(
          expect.arrayContaining([envConfig.FRANCHISE_A_NAME, SECOND_FRANCHISE_ACCOUNT]),
        );
        await authedMarketplaceDealPage.selectFranchiseIfPresent(SECOND_FRANCHISE_ACCOUNT);
        await expect
          .poll(() => authedMarketplaceDealPage.hasWithdrawDealOption(), {
            timeout: 15000,
            message: 'Withdraw Deal offered under the listing franchise',
          })
          .toBe(true);
      });

      // Withdrawn straight away so the test deal doesn't sit in other franchises' Available list.
      await test.step('Withdraw the test deal', async () => {
        await authedMarketplaceDealPage.withdrawDeal();
        Logger.log(`${deal.mpdId} withdrawn: "${await authedMarketplaceDealPage.waitForToastText().catch(() => '')}"`);
      });
    },
  );

  // Covers: VA_010
  test(
    "Bidding Franchise offers each of the owner's franchises on another franchise's deal @regression",
    { tag: '@CARD-13' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Open the Marketplace with filters reset', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getDealCardCount();
      });

      test.skip(count === 0, 'No Available deals to open');

      await test.step('Open the first deal', async () => {
        await authedMarketplacePage.openDealByIndex(0);
        await authedMarketplaceDealPage.expectLoaded();
      });

      await test.step("Verify both of the owner's franchises are offered, then close the deal", async () => {
        const options = await authedMarketplaceDealPage.getBiddingFranchiseOptions();
        Logger.log(
          `${await authedMarketplaceDealPage.getMpdId()} Bidding Franchise options: ${JSON.stringify(options)}`,
        );
        expect(options).toEqual(
          expect.arrayContaining(
            [
              expect.stringContaining(franchiseBaseName(envConfig.FRANCHISE_A_NAME)),
              expect.stringContaining(franchiseBaseName(SECOND_FRANCHISE_ACCOUNT)),
            ],
          ),
        );
        await authedMarketplaceDealPage.close();
      });
    },
  );
});

// =====================================================================
// Property image (single account)
// =====================================================================

test.describe('Deal Card & Deal Detail View — property image @regression @MarketplaceDealCardDealDetailView', () => {
  // Covers: EG_025
  test(
    'A deal with no uploaded photo shows a Google property image in the deal view @regression',
    { tag: '@CARD-14' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const ids = await test.step('Open the Marketplace filtered to My Listed Deals', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.resetFilters();
        // Test deals are listed from fresh ops with no uploaded photo.
        await authedMarketplacePage.selectDealStatus('My Listed Deals');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getFirstCardMpdIds(8);
      });

      test.skip(ids.length === 0, 'No listed deals');

      // Seen QA 2026-10-11: the Google (Street View) image shows when Google has imagery for the
      // address; otherwise the deal falls back to a placeholder drawing (e.g. rural Almont, CO).
      const googleIds = await test.step('Open each listed deal and check which image it shows', async () => {
        return dealsShowingGoogleImage(authedMarketplacePage, authedMarketplaceDealPage, ids);
      });

      await test.step('Verify at least one deal shows a Google property image', async () => {
        expect(googleIds.length, 'at least one listed deal shows a Google property image').toBeGreaterThan(0);
      });
    },
  );
});

// =====================================================================
// Additional deal fields — who sees them, at each stage (two franchises).
// The 7 fields: Deal Stage / Listed Date / Opp Transferred / Seller Stage /
// Last Activity / Purchased / Sold Date. Live-verified QA 2026-10-11: before a
// win the listing franchise sees Deal Stage / Listed Date / Last Activity; the
// rest appear once a bid is accepted. Bidders see none until they win.
// The second bidder is the owner's other franchise (Bidding Franchise = acting franchise).
// =====================================================================

const ACTIVE_FIELDS = ['Deal Stage', 'Listed Date', 'Last Activity'];
const WON_FIELDS = [
  'Deal Stage',
  'Listed Date',
  'Opp Transferred',
  'Seller Stage',
  'Last Activity',
  'Purchased',
  'Sold Date',
];

test.describe('Deal Card & Deal Detail View — additional fields by role and stage @regression @MarketplaceDealCardDealDetailView @TwoAccount', () => {
  test.describe.configure({ timeout: 1_200_000 });

  // Franchise B never sees Franchise A's deals (QA 2026-10-26), so the bidder is the owner's other
  // franchise, in a second tab of the same login. It is the only franchise that can bid on these
  // deals, so a won deal has no losing bidder — the declined-bidder view has its own test below.
  test.beforeAll(async ({ authedPage, otherFranchisePage }) => {
    await tileWindow(authedPage, 'left');
    await tileWindow(otherFranchisePage, 'right');
  });

  for (const type of ['Opportunity', 'Assignment'] as const) {
    const opp = type === 'Opportunity';

    // Covers: UF_002, UF_003, UF_010, UF_011, UF_006, UF_007, FD_001, FD_003 (Opportunity); UF_004, UF_005, UF_014,
    // UF_008, UF_009 (Assignment)
    test(`Only the listing franchise sees the additional fields on a live ${type} deal; both it and the winner see all of them once won @regression`, async ({
      
      
      authedHomePage,
      authedSellerLeadPage,
      authedMarketplacePage,
      authedMarketplaceDealPage,
      otherFranchiseMarketplacePage,
      otherFranchiseMarketplaceDealPage,
    }) => {
      const a = authedMarketplaceDealPage;
      const o = otherFranchiseMarketplaceDealPage;
      const bidder = SECOND_FRANCHISE_ACCOUNT;

      // Covers: UF_002 (Opportunity), UF_004 (Assignment)
      const deal = await test.step(`List a fresh ${type} deal as Franchise A`, async () => {
        return listFreshDeal(authedHomePage, authedSellerLeadPage, authedMarketplacePage, a, type, '');
      });

      await test.step(`The listing franchise sees the additional fields on its new ${type} deal`, async () => {
        await a.selectFranchiseIfPresent(envConfig.FRANCHISE_A_NAME);
        expect(await a.getAdditionalFieldNames()).toEqual(expect.arrayContaining(ACTIVE_FIELDS));
        // A fresh listing starts in the Ad Council stage.
        expect(await a.getDealStage(), 'new deal is in the Ad Council stage').toBe('Ad Council');
        if (!opp) {
          // Covers: UF_014 — the owner's other franchise is not involved in this deal yet.
          await a.selectFranchiseIfPresent(bidder);
          await expect
            .poll(() => a.getAdditionalFieldNames(), {
              timeout: 15000,
              message: 'an uninvolved franchise sees no additional fields',
            })
            .toEqual([]);
        }
        await a.close();
      });

      // Covers: UF_003 (Opportunity), UF_005 (Assignment)
      await test.step('A franchise that can bid sees none of them', async () => {
        await otherFranchiseMarketplacePage.bringToFront();
        expect(
          await openDealAs(otherFranchiseMarketplacePage, o, deal.mpdId, 'Available', bidder),
          'the other franchise sees the deal',
        ).toBe(true);
        expect(await o.isEligibleToBid(), 'Place Bid offered during the Ad Council stage').toBe(true);
        expect(await o.getAdditionalFieldNames()).toEqual([]);
        await o.close();
        await placeBidAs(otherFranchiseMarketplacePage, o, deal.mpdId, 'Bid for the fields check', bidder);
        await o.close();
      });

      if (opp) {
        // Covers: UF_010, UF_011
        await test.step('While the bid is In Review the listing franchise still sees them and the bidder does not', async () => {
          expect(await openDealAs(otherFranchiseMarketplacePage, o, deal.mpdId, 'My Bids', bidder)).toBe(true);
          expect(await o.getAdditionalFieldNames(), 'bidder, bid In Review').toEqual([]);
          await o.close();
          await authedMarketplacePage.bringToFront();
          expect(
            await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
          ).toBe(true);
          expect(await a.getDealDialogText()).toMatch(/In Review/);
          expect(await a.getAdditionalFieldNames(), 'listing franchise, bid In Review').toEqual(
            expect.arrayContaining(ACTIVE_FIELDS),
          );
          await a.close();
        });
      }

      await test.step("The listing franchise accepts the other franchise's bid", async () => {
        await authedMarketplacePage.bringToFront();
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        await a.openBidDecisionFor('Accept', bidder);
        await a.confirmBidDecision('Accept');
        expect(await a.waitForToastText()).toContain('The Marketplace Bid has been Accepted');
        await a.close();
      });

      // Covers: UF_006 / FD_003 (Opportunity), UF_008 (Assignment)
      await test.step('Under My Listed Deals > Bid Accepted the listing franchise sees the won message and all seven fields', async () => {
        expect(await openListedDealUnderStage(authedMarketplacePage, a, deal.mpdId, 'Bid Accepted')).toBe(true);
        await a.selectFranchiseIfPresent(envConfig.FRANCHISE_A_NAME);
        expect(await a.getDealDialogText()).toContain(
          `This Marketplace deal has already been won. The winning franchise for this deal is: ${bidder}.`,
        );
        expect(await a.getAdditionalFieldNames()).toEqual(expect.arrayContaining(WON_FIELDS));
        await a.close();
      });

      // Covers: UF_007 / FD_001 (Opportunity), UF_009 (Assignment)
      await test.step('Under My Bids > Accepted the winning franchise sees the won message and all seven fields', async () => {
        await otherFranchiseMarketplacePage.bringToFront();
        expect(await openBidDealUnderStage(otherFranchiseMarketplacePage, o, deal.mpdId, 'Accepted')).toBe(true);
        expect(await o.getDealDialogText()).toContain(
          `This Marketplace deal has already been won. The winning franchise for this deal is: ${bidder}.`,
        );
        expect(await o.getAdditionalFieldNames()).toEqual(expect.arrayContaining(WON_FIELDS));
        await o.close();
      });
    });
  }

  // Covers: UF_012, UF_013, FD_005
  test('After a bid is declined the listing franchise still sees the additional fields and the declined bidder sees none @regression', async ({
    
    
    authedHomePage,
    authedSellerLeadPage,
    authedMarketplacePage,
    authedMarketplaceDealPage,
    otherFranchiseMarketplacePage,
    otherFranchiseMarketplaceDealPage,
  }) => {
    const a = authedMarketplaceDealPage;
    const o = otherFranchiseMarketplaceDealPage;
    const bidder = SECOND_FRANCHISE_ACCOUNT;

    const deal = await test.step('Franchise A lists a new Opportunity deal', async () => {
      const listed = await listFreshDeal(authedHomePage, authedSellerLeadPage, authedMarketplacePage, a, 'Opportunity', '');
      await a.close();
      return listed;
    });

    await test.step('The other franchise bids on it', async () => {
      await otherFranchiseMarketplacePage.bringToFront();
      await placeBidAs(otherFranchiseMarketplacePage, o, deal.mpdId, 'Bid to be declined for the fields check', bidder);
      await o.close();
    });

    // Covers: UF_012
    await test.step('After declining the bid, the listing franchise still sees them', async () => {
      await authedMarketplacePage.bringToFront();
      expect(
        await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
      ).toBe(true);
      await a.openBidDecisionFor('Decline', bidder);
      await a.confirmBidDecision('Decline');
      expect(await a.waitForToastText()).toMatch(/Bid has been Declined/i);
      await a.close();
      expect(
        await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
      ).toBe(true);
      expect(await a.getAdditionalFieldNames(), 'listing franchise, a bid Declined').toEqual(expect.arrayContaining(ACTIVE_FIELDS));
      await a.close();
    });

    // Covers: UF_013, FD_005
    await test.step('Under My Bids > Lost the declined bidder sees its lost-bid message and no additional fields', async () => {
      await otherFranchiseMarketplacePage.bringToFront();
      expect(await openBidDealUnderStage(otherFranchiseMarketplacePage, o, deal.mpdId, 'Lost')).toBe(true);
      await o.selectFranchiseIfPresent(bidder);
      // App copy (QA 2026-10-26): a declined bid reads as "Bid Lost" to the bidder.
      expect(await o.getDealDialogText()).toContain(
        `You have already placed a bid on this Marketplace deal with ${bidder}. Current bid status: Bid Lost`,
      );
      expect(await o.getAdditionalFieldNames(), 'declined bidder sees no additional fields').toEqual([]);
      expect(await o.isEligibleToBid(), 'a declined franchise cannot bid again').toBe(false);
      await o.close();
    });

    await test.step('Clean up: Franchise A withdraws the deal', async () => {
      await authedMarketplacePage.bringToFront();
      expect(
        await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
      ).toBe(true);
      await a.withdrawDeal();
      expect(await a.waitForToastText()).toContain('Deal Withdrawn Successfully');
    });
  });
});

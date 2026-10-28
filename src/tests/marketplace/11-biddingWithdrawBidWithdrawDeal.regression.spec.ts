import { test, expect } from '@fixtures/testFixtures';
import { envConfig } from '@config/env.config';
import {
  closeDealFromOpportunity,
  listFreshDeal,
  openDealAs,
  openDealFromOpportunity,
  openDealInSecondTab,
  placeBidAs,
} from '@utils/directInvite';
import { tileWindow } from '@utils/windowLayout';
import { Logger } from '@utils/logger';
import { withdrawFirstWithdrawableInReviewBid } from '@utils/dealScan';

/**
 * Workflow suite for the Marketplace_Master sheet's workflow:
 * "Bidding: Withdraw Bid / Withdraw Deal"
 * (see the sheet's Workflow Summary / Automation Categorization tabs).
 *
 * Some tests here moved from the former marketplaceBidFlow.regression.spec.ts — its
 * scope notes now live in 08-biddingPlaceBid.regression.spec.ts.
 *
 * Some tests here moved from the former marketplaceDealLifecycle.regression.spec.ts — its
 * scope notes now live in 07-directInviteFlow.regression.spec.ts.
 */

test.describe('Bidding: Withdraw Bid / Withdraw Deal @regression @MarketplaceBiddingWithdrawBidWithdrawDeal', () => {
  // =====================================================================
  // BW_015/016: Withdraw Bid unavailable once a bid is Accepted or Lost (Declined)
  // =====================================================================

  // Covers: BW_015/016
  test(
    "Withdraw Bid is unavailable once this franchise's bid is Accepted or Lost @regression",
    { tag: '@WITHDRAW-01' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      await test.step('Open Home as the starting point', async () => {
        await authedHomePage.openAndSettle();
      });

      for (const stage of ['Accepted', 'Lost'] as const) {
        const count = await test.step(`Filter My Bids to Bid Stage ${stage}`, async () => {
          await authedMarketplacePage.navigate();
          await authedMarketplacePage.expectMarketplaceLoaded();
          await authedMarketplacePage.selectDealStatus('My Bids');
          await authedMarketplacePage.selectBidStage(stage);
          await authedMarketplacePage.applyFilters();
          await authedMarketplacePage.expectMarketplaceLoaded();
          const n = await authedMarketplacePage.getDealCardCount();
          Logger.log(`${n} deal(s) with Bid Stage = ${stage}`);
          return n;
        });

        if (count === 0) {
          Logger.log(`No ${stage} bid found — inconclusive for this stage`);
          continue;
        }

        await test.step(`Withdraw Bid is not offered on a ${stage} bid`, async () => {
          await authedMarketplacePage.openDealByIndex(0);
          await authedMarketplaceDealPage.expectLoaded();
          const canWithdraw = await authedMarketplaceDealPage.hasWithdrawBidOption();
          Logger.log(`Withdraw Bid available on a ${stage} bid = ${canWithdraw}`);
          expect(canWithdraw).toBe(false);
          await authedMarketplaceDealPage.close();
        });
      }
    },
  );

  // =====================================================================
  // BW_007/014/017: Withdraw Bid appears for an In Review bid and clears it on success
  // =====================================================================

  // Covers: BW_007/014/017, RA_036
  test(
    'An In Review bid can be withdrawn, after which the option disappears @regression',
    { tag: '@WITHDRAW-02' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      test.setTimeout(180_000);
      const maxScan = 15;

      await test.step('Open Home as the starting point', async () => {
        await authedHomePage.openAndSettle();
      });

      const found = await test.step('Find an In Review bid that offers Withdraw Bid and withdraw it', async () => {
        return withdrawFirstWithdrawableInReviewBid(authedMarketplacePage, authedMarketplaceDealPage, maxScan);
      });

      test.skip(!found, `No In Review bid found to withdraw (scanned up to the first ${maxScan} deals)`);

      await test.step('Verify Withdraw Bid is no longer offered', async () => {
        const stillOffered = await authedMarketplaceDealPage.hasWithdrawBidOption().catch(() => false);
        Logger.log(`Withdraw Bid option still shown after withdrawing = ${stillOffered}`);
        expect(stillOffered).toBe(false);
      });
    },
  );

  // =====================================================================
  // Withdraw Deal — available pre-acceptance, unavailable once Bid Accepted
  // =====================================================================

  test(
    'Withdraw Deal is available on a not-yet-accepted listed deal, unavailable once Bid Accepted @regression',
    { tag: '@WITHDRAW-03' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      await test.step('Open Home as the starting point', async () => {
        await authedHomePage.openAndSettle();
      });

      await test.step('Withdraw Deal is offered on a Full Network (not yet accepted) listed deal', async () => {
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.selectDealStatus('My Listed Deals');
        await authedMarketplacePage.selectDealStage('Full Network');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        const openCount = await authedMarketplacePage.getDealCardCount();
        Logger.log(`Withdraw Deal: ${openCount} Full Network (not yet accepted) listed deal(s)`);
        if (openCount > 0) {
          await authedMarketplacePage.openDealByIndex(0);
          await authedMarketplaceDealPage.expectLoaded();
          const canWithdraw = await authedMarketplaceDealPage.hasWithdrawDealOption();
          Logger.log(`Withdraw Deal available on a Full Network listed deal = ${canWithdraw}`);
          expect(canWithdraw).toBe(true);
          await authedMarketplaceDealPage.close();
        } else {
          Logger.log('Withdraw Deal: no Full Network listed deal found — inconclusive for the "available" half');
        }
      });

      await test.step('Withdraw Deal is not offered on a Bid Accepted listed deal', async () => {
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.selectDealStatus('My Listed Deals');
        await authedMarketplacePage.selectDealStage('Bid Accepted');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        const acceptedCount = await authedMarketplacePage.getDealCardCount();
        Logger.log(`Withdraw Deal: ${acceptedCount} Bid Accepted listed deal(s)`);
        if (acceptedCount > 0) {
          await authedMarketplacePage.openDealByIndex(0);
          await authedMarketplaceDealPage.expectLoaded();
          const canWithdraw = await authedMarketplaceDealPage.hasWithdrawDealOption();
          Logger.log(`Withdraw Deal available on a Bid Accepted deal = ${canWithdraw}`);
          expect(canWithdraw).toBe(false);
          await authedMarketplaceDealPage.close();
        } else {
          Logger.log('Withdraw Deal: no Bid Accepted listed deal found — inconclusive for the "unavailable" half');
        }
      });
    },
  );
});

// =====================================================================
// Two franchises side by side: Franchise A (authedPage, left window) lists a
// brand-new seller op with no Direct Invite, its owner's other franchise
// (otherFranchisePage, a second tab of the same login, right window) bids and
// withdraws its bid, then Franchise A withdraws the deal. Franchise B never
// sees Franchise A's deals (QA 2026-10-26), so it can't be the bidder. Live-verified QA 2026-10-09: Withdraw Bid and
// Withdraw Deal act at
// once (no confirmation popup), and Withdraw Deal is hidden while a bid is In
// Review. One-way: adds 1 Opportunity per run (left withdrawn).
// =====================================================================

const BIDDER = envConfig.FRANCHISE_A_OTHER_NAME;

test.describe('Bidding: Withdraw Bid / Withdraw Deal — two franchises side by side @regression @MarketplaceBiddingWithdrawBidWithdrawDeal @TwoAccount', () => {
  test.describe.configure({ timeout: 900_000 });

  test.beforeAll(async ({ authedPage, otherFranchisePage }) => {
    await tileWindow(authedPage, 'left');
    await tileWindow(otherFranchisePage, 'right');
  });

  test.beforeEach(() => {
    test.skip(
      !BIDDER || !envConfig.FRANCHISE_A_NAME,
      `FRANCHISE_A_NAME/FRANCHISE_A_OTHER_NAME not set in .env.${envConfig.ENV}`,
    );
  });

  // Covers: SMK_003/SD_019/BW_017/SAN_044/SAN_057/MSG_002
  test(
    "The owner's other franchise withdraws its bid, then Franchise A withdraws the deal @regression",
    { tag: '@WITHDRAW-04' },
    async ({
      
      otherFranchisePage,
      authedHomePage,
      authedSellerLeadPage,
      authedMarketplacePage,
      authedMarketplaceDealPage,
      otherFranchiseMarketplacePage,
      otherFranchiseMarketplaceDealPage,
    }) => {
      const a = authedMarketplaceDealPage;
      const b = otherFranchiseMarketplaceDealPage;

      // Covers: CTA_001
      const deal = await test.step('Franchise A lists a new seller op (no Direct Invite)', async () => {
        const listed = await listFreshDeal(authedHomePage, authedSellerLeadPage, authedMarketplacePage, a, 'Opportunity', '');
        await a.close();
        return listed;
      });

      // Covers: SMK_003/SD_019, CTA_002, ST_007
      await test.step('The seller op\'s CTA now reads "View in Marketplace" and opens the deal, with Withdraw Deal', async () => {
        await authedSellerLeadPage.navigateById(deal.oppId);
        expect(await authedSellerLeadPage.getMarketplaceCtaText()).toMatch(/^View (in )?Marketplace/);
        expect(await authedSellerLeadPage.isListInMarketplaceCtaShown()).toBe(false);
        const fromOpp = await openDealFromOpportunity(authedSellerLeadPage);
        expect(await fromOpp.getMpdId()).toBe(deal.mpdId);
        expect(await fromOpp.hasWithdrawDealOption(), 'Withdraw Deal from the Seller Opportunity entry point').toBe(
          true,
        );
        await closeDealFromOpportunity(authedSellerLeadPage, fromOpp);
      });

      const staleB = await test.step('The other franchise opens the deal in a second tab, still offering Place Bid', async () => {
        const tab = await openDealInSecondTab(otherFranchisePage, deal.mpdId, 'Available', BIDDER);
        expect(await tab.dealPage.isEligibleToBid()).toBe(true);
        return tab;
      });

      await test.step('The other franchise bids on the deal in its first tab', async () => {
        await otherFranchiseMarketplacePage.bringToFront();
        await placeBidAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'Bid to be withdrawn', BIDDER);
        await b.close();
      });

      // Covers: BW_017/SAN_044, MSG_015
      await test.step('The other franchise withdraws its In Review bid — success message, gone from My Bids > In Review, Place Bid offered again', async () => {
        expect(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'My Bids', BIDDER)).toBe(true);
        expect(await b.hasWithdrawBidOption()).toBe(true);
        await b.withdrawBid();
        const toast = await b.waitForToastText();
        Logger.log(`  [Withdraw] Withdraw Bid toast: "${toast}"`);
        expect(toast).toContain('Bid Withdrawn Successfully');

        await otherFranchiseMarketplacePage.navigate();
        await otherFranchiseMarketplacePage.expectMarketplaceLoaded();
        await otherFranchiseMarketplacePage.selectDealStatus('My Bids');
        await otherFranchiseMarketplacePage.selectBidStage('In Review');
        await otherFranchiseMarketplacePage.applyFilters();
        await otherFranchiseMarketplacePage.expectMarketplaceLoaded();
        expect(await otherFranchiseMarketplacePage.getAllCardMpdIds()).not.toContain(deal.mpdId);

        expect(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'Available', BIDDER)).toBe(true);
        expect(await b.isEligibleToBid(), 'Place Bid offered again after withdrawing').toBe(true);
        await b.close();
      });

      // Covers: SD_019
      await test.step('From the Marketplace listing (My Listed Deals > View Deal), Franchise A is offered Withdraw Deal again now no bid is open', async () => {
        await authedMarketplacePage.bringToFront();
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        expect(await a.hasWithdrawDealOption()).toBe(true);
      });

      // Covers: SAN_057, MSG_016, SMK_013
      await test.step('Withdraw Deal shows "Deal Withdrawn Successfully" and the deal leaves the Marketplace', async () => {
        await a.withdrawDeal();
        const toast = await a.waitForToastText();
        Logger.log(`  [Withdraw] Withdraw Deal toast: "${toast}"`);
        expect(toast).toContain('Deal Withdrawn Successfully');
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals'),
          'Withdrawn deal leaves My Listed Deals',
        ).toBe(false);
        expect(
          await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'Available'),
          'Withdrawn deal leaves Available',
        ).toBe(false);
      });

      // Covers: MSG_002
      await test.step("Bidding from the other franchise's stale tab is refused because the deal is Withdrawn", async () => {
        await staleB.dealPage.bringToFront();
        await staleB.dealPage.openPlaceBidConfirmation('Bid on a withdrawn deal');
        await staleB.dealPage.submitPlaceBidConfirmation();
        const toast = await staleB.dealPage.waitForToastText();
        Logger.log(`  [Withdraw] stale Place Bid toast: "${toast}"`);
        expect(toast).toMatch(/Bid cannot be placed as the marketplace deal is in '?Withdrawn'? stage/i);
        await staleB.dealPage.closeTab();
      });
    },
  );
});

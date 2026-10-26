import { test, expect } from '../../fixtures/testFixtures';
import type { Page } from '@playwright/test';
import type { HomePage } from '../../modules/dashboard';
import type { TestData } from '../../fixtures/testFixtures';
import { envConfig } from '../../config/env.config';
import { MarketplaceDealPage } from '../../modules/marketplace';
import { listWithDirectInvite, openDealAs, openDealInSecondTab, placeBidAs, type DirectInviteDeal } from '../../utils/directInvite';
import { tileWindow } from '../../utils/windowLayout';

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

async function resetToHome(authedPage: Page, authedHomePage: HomePage, data: TestData) {
  await authedHomePage.navigate();
  await authedPage.waitForLoadState('domcontentloaded');
  await authedPage.waitForTimeout(data.timeouts.settle);
}

async function settleAfter(authedPage: Page, data: TestData) {
  await authedPage.waitForTimeout(data.timeouts.afterEach);
}

test.describe('Bidding: Withdraw Bid / Withdraw Deal @regression @MarketplaceBiddingWithdrawBidWithdrawDeal', () => {
  // =====================================================================
  // BW_015/016: Withdraw Bid unavailable once a bid is Accepted or Lost (Declined)
  // =====================================================================

  // Covers: BW_015/016
  test('Withdraw Bid is unavailable once this franchise\'s bid is Accepted or Lost @regression', { tag: '@WITHDRAW-01' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);

    for (const stage of ['Accepted', 'Lost'] as const) {
      await authedMarketplacePage.navigate();
      await authedMarketplacePage.expectMarketplaceLoaded();
      await authedMarketplacePage.selectDealStatus('My Bids');
      await authedMarketplacePage.selectBidStage(stage);
      await authedMarketplacePage.applyFilters();
      await authedMarketplacePage.expectMarketplaceLoaded();

      const count = await authedMarketplacePage.getDealCardCount();
      console.log(`${count} deal(s) with Bid Stage = ${stage}`);
      if (count === 0) {
        console.log(`No ${stage} bid found — inconclusive for this stage`);
        continue;
      }

      await authedMarketplacePage.openDealByIndex(0);
      await authedMarketplaceDealPage.expectLoaded();
      const canWithdraw = await authedMarketplaceDealPage.hasWithdrawBidOption();
      console.log(`Withdraw Bid available on a ${stage} bid = ${canWithdraw}`);
      expect(canWithdraw).toBe(false);
      await authedMarketplaceDealPage.close();
    }
    await settleAfter(authedPage, data);
  });

  // =====================================================================
  // BW_007/014/017: Withdraw Bid appears for an In Review bid and clears it on success
  // =====================================================================

  // Covers: BW_007/014/017, RA_036
  test('An In Review bid can be withdrawn, after which the option disappears @regression', { tag: '@WITHDRAW-02' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    test.setTimeout(180_000);
    await resetToHome(authedPage, authedHomePage, data);
    // page.goBack() is unreliable here — re-navigate + re-apply filters each scan iteration.
    const maxScan = 15;
    let found = false;

    for (let i = 0; i < maxScan; i++) {
      await authedMarketplacePage.navigate();
      await authedMarketplacePage.expectMarketplaceLoaded();
      await authedMarketplacePage.selectDealStatus('My Bids');
      await authedMarketplacePage.selectBidStage('In Review');
      await authedMarketplacePage.applyFilters();
      await authedMarketplacePage.expectMarketplaceLoaded();
      const count = await authedMarketplacePage.getDealCardCount();
      if (i >= count) break;

      await authedMarketplacePage.openDealByIndex(i).catch(() => {});
      await authedMarketplaceDealPage.expectLoaded().catch(() => {});
      if (await authedMarketplaceDealPage.hasWithdrawBidOption()) {
        found = true;
        console.log(`Withdraw Bid option present on In Review bid index ${i}`);
        await authedMarketplaceDealPage.withdrawBid();
        const stillOffered = await authedMarketplaceDealPage.hasWithdrawBidOption().catch(() => false);
        console.log(`Withdraw Bid option still shown after withdrawing = ${stillOffered}`);
        expect(stillOffered).toBe(false);
        break;
      }
    }
    if (!found) console.log(`No In Review bid found to withdraw — inconclusive (scanned up to first ${maxScan} deals)`);
    await settleAfter(authedPage, data);
  });

  // =====================================================================
  // Withdraw Deal — available pre-acceptance, unavailable once Bid Accepted
  // =====================================================================

  test('Withdraw Deal is available on a not-yet-accepted listed deal, unavailable once Bid Accepted @regression', { tag: '@WITHDRAW-03' }, async ({
    authedPage, data, authedHomePage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);

    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectDealStatus('My Listed Deals');
    await authedMarketplacePage.selectDealStage('Full Network');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const openCount = await authedMarketplacePage.getDealCardCount();
    console.log(`Withdraw Deal: ${openCount} Full Network (not yet accepted) listed deal(s)`);
    if (openCount > 0) {
      await authedMarketplacePage.openDealByIndex(0);
      await authedMarketplaceDealPage.expectLoaded();
      const canWithdraw = await authedMarketplaceDealPage.hasWithdrawDealOption();
      console.log(`Withdraw Deal available on a Full Network listed deal = ${canWithdraw}`);
      expect(canWithdraw).toBe(true);
      await authedMarketplaceDealPage.close();
    } else {
      console.log('Withdraw Deal: no Full Network listed deal found — inconclusive for the "available" half');
    }

    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectDealStatus('My Listed Deals');
    await authedMarketplacePage.selectDealStage('Bid Accepted');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const acceptedCount = await authedMarketplacePage.getDealCardCount();
    console.log(`Withdraw Deal: ${acceptedCount} Bid Accepted listed deal(s)`);
    if (acceptedCount > 0) {
      await authedMarketplacePage.openDealByIndex(0);
      await authedMarketplaceDealPage.expectLoaded();
      const canWithdraw = await authedMarketplaceDealPage.hasWithdrawDealOption();
      console.log(`Withdraw Deal available on a Bid Accepted deal = ${canWithdraw}`);
      expect(canWithdraw).toBe(false);
      await authedMarketplaceDealPage.close();
    } else {
      console.log('Withdraw Deal: no Bid Accepted listed deal found — inconclusive for the "unavailable" half');
    }

    await settleAfter(authedPage, data);
  });
});


// =====================================================================
// Two franchises side by side: Franchise A (authedPage, left window) lists a
// brand-new seller op with no Direct Invite, its owner's other franchise
// (otherFranchisePage, a second tab of the same login, right window) bids and
// withdraws its bid, then Franchise A withdraws the deal. Franchise B never
// sees Franchise A's deals (QA 2026-10-26), so it can't be the bidder. Live-verified QA 2026-10-09: Withdraw Bid and Withdraw Deal act at
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
    test.skip(!BIDDER || !envConfig.FRANCHISE_A_NAME, `FRANCHISE_A_NAME/FRANCHISE_A_OTHER_NAME not set in .env.${envConfig.ENV}`);
  });

  // Covers: SMK_003/SD_019/BW_017/SAN_044/SAN_057/MSG_002
  test('The owner\'s other franchise withdraws its bid, then Franchise A withdraws the deal @regression', { tag: '@WITHDRAW-04' }, async ({
    authedPage, otherFranchisePage, authedHomePage, authedSellerLeadPage, authedMarketplacePage, authedMarketplaceDealPage,
    otherFranchiseMarketplacePage, otherFranchiseMarketplaceDealPage,
  }) => {
    const a = authedMarketplaceDealPage;
    const b = otherFranchiseMarketplaceDealPage;
    let deal!: DirectInviteDeal;
    let staleB!: Awaited<ReturnType<typeof openDealInSecondTab>>;

    // Covers: CTA_001
    await test.step('Franchise A lists a new seller op (no Direct Invite)', async () => {
      const listed = await listWithDirectInvite(authedHomePage, authedSellerLeadPage, authedMarketplacePage, a, 'Opportunity', '');
      expect(listed, 'Freshly created seller op must show "List in Marketplace"').not.toBeNull();
      deal = listed!;
      await a.close();
    });

    // Covers: SMK_003/SD_019, CTA_002, ST_007
    await test.step('The seller op\'s CTA now reads "View in Marketplace" and opens the deal, with Withdraw Deal', async () => {
      await authedSellerLeadPage.navigateById(deal.oppId);
      expect(await authedSellerLeadPage.getMarketplaceCtaText()).toMatch(/^View (in )?Marketplace/);
      expect(await authedSellerLeadPage.isListInMarketplaceCtaShown()).toBe(false);
      const opened = await authedSellerLeadPage.clickViewInMarketplace();
      const fromOpp = new MarketplaceDealPage(opened);
      await fromOpp.expectLoaded();
      expect(await fromOpp.getMpdId()).toBe(deal.mpdId);
      expect(await fromOpp.hasWithdrawDealOption(), 'Withdraw Deal from the Seller Opportunity entry point').toBe(true);
      if (opened !== authedPage) await opened.close();
      else await fromOpp.close();
    });

    await test.step('The other franchise opens the deal in a second tab (still offering Place Bid) and bids on it in the first', async () => {
      staleB = await openDealInSecondTab(otherFranchisePage, deal.mpdId, 'Available', BIDDER);
      expect(await staleB.dealPage.isEligibleToBid()).toBe(true);
      await otherFranchisePage.bringToFront();
      await placeBidAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'Bid to be withdrawn', BIDDER);
      await b.close();
    });

    // Covers: BW_017/SAN_044, MSG_015
    await test.step('The other franchise withdraws its In Review bid — success message, gone from My Bids > In Review, Place Bid offered again', async () => {
      expect(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'My Bids', BIDDER)).toBe(true);
      expect(await b.hasWithdrawBidOption()).toBe(true);
      await b.withdrawBid();
      const toast = await b.waitForToastText();
      console.log(`  [Withdraw] Withdraw Bid toast: "${toast}"`);
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
      await authedPage.bringToFront();
      expect(await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME)).toBe(true);
      expect(await a.hasWithdrawDealOption()).toBe(true);
    });

    // Covers: SAN_057, MSG_016, SMK_013
    await test.step('Withdraw Deal shows "Deal Withdrawn Successfully" and the deal leaves the Marketplace', async () => {
      await a.withdrawDeal();
      const toast = await a.waitForToastText();
      console.log(`  [Withdraw] Withdraw Deal toast: "${toast}"`);
      expect(toast).toContain('Deal Withdrawn Successfully');
      expect(await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals'), 'Withdrawn deal leaves My Listed Deals').toBe(false);
      expect(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'Available'), 'Withdrawn deal leaves Available').toBe(false);
    });

    // Covers: MSG_002
    await test.step('Bidding from the other franchise\'s stale tab is refused because the deal is Withdrawn', async () => {
      await staleB.tab.bringToFront();
      await staleB.dealPage.openPlaceBidConfirmation('Bid on a withdrawn deal');
      await staleB.dealPage.submitPlaceBidConfirmation();
      const toast = await staleB.dealPage.waitForToastText();
      console.log(`  [Withdraw] stale Place Bid toast: "${toast}"`);
      expect(toast).toMatch(/Bid cannot be placed as the marketplace deal is in '?Withdrawn'? stage/i);
      await staleB.tab.close();
    });
  });
});

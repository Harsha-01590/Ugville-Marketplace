import { test, expect } from '@fixtures/testFixtures';
import { envConfig } from '@config/env.config';
import { listFreshDeal, openDealAs, placeBidAs } from '@utils/directInvite';
import { tileWindow } from '@utils/windowLayout';
import { Logger } from '@utils/logger';
import { alreadyBidPattern, franchiseStatusPattern } from '@modules/marketplace';

/**
 * Workflow suite for the Marketplace_Master sheet's workflow:
 * "Bidding: Decline Bid"
 * (see the sheet's Workflow Summary / Automation Categorization tabs).
 *
 * Two franchises side by side: Franchise A (authedPage, left window) lists a
 * brand-new seller op with no Direct Invite, its owner's other franchise
 * (otherFranchisePage, a second tab of the same login, right window) bids on
 * it, and Franchise A declines that bid. Franchise B never sees Franchise A's
 * deals (QA 2026-10-26), so it can't be the bidder. One end-to-end journey,
 * each sheet case a test.step. One-way: adds 1 Opportunity + 1 bid per run.
 * Run `--headed` to watch both windows tiled.
 */

const BIDDER = envConfig.FRANCHISE_A_OTHER_NAME;
const BID_REASON = 'Bid to be declined';

test.describe('Bidding: Decline Bid — two franchises side by side @regression @MarketplaceBiddingDeclineBid @TwoAccount', () => {
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

  // Covers: SAN_041/SAN_042/MSG_007/SAN_043/MSG_019
  test(
    "Franchise A declines its owner's other franchise's bid @regression",
    { tag: '@DECLINE-01' },
    async ({
      
      
      authedHomePage,
      authedSellerLeadPage,
      authedMarketplacePage,
      authedMarketplaceDealPage,
      otherFranchiseMarketplacePage,
      otherFranchiseMarketplaceDealPage,
    }) => {
      const a = authedMarketplaceDealPage;
      const b = otherFranchiseMarketplaceDealPage;

      const deal = await test.step('Franchise A lists a new seller op (no Direct Invite)', async () => {
        const listed = await listFreshDeal(authedHomePage, authedSellerLeadPage, authedMarketplacePage, a, 'Opportunity', '');
        // Covers: ST_002, ST_004
        expect
          .soft(listed.listToast, 'success toast after listing an Opportunity deal')
          .toMatch(/Opportunity deal listed to Marketplace successfully/i);
        await a.close();
        return listed;
      });

      await test.step('The other franchise bids on it', async () => {
        await otherFranchiseMarketplacePage.bringToFront();
        await placeBidAs(otherFranchiseMarketplacePage, b, deal.mpdId, BID_REASON, BIDDER);
        await b.close();
      });

      // Covers: SAN_041, BW_027, MSG_027, BW_033
      await test.step('Decline Bid opens "Confirmation of Bid Decline" / "Are you sure you want to decline this Bid?" with Cancel and Decline Bid', async () => {
        await authedMarketplacePage.bringToFront();
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        expect(await a.getDealDialogText()).toMatch(franchiseStatusPattern(BIDDER, 'In Review'));
        const popup = await a.openBidDecision('Decline');
        expect(popup).toContain('Confirmation of Bid Decline');
        expect(popup).toContain('Are you sure you want to decline this Bid?');
        const buttons = await a.getBidDecisionButtonLabels();
        expect(buttons).toContain('Cancel');
        expect(buttons).toContain('Decline Bid');
      });

      // Covers: SAN_042, BW_028, BW_033
      await test.step('Cancel closes the popup and the bid stays In Review', async () => {
        await a.cancelBidDecision();
        expect(await a.getDealDialogText()).toMatch(franchiseStatusPattern(BIDDER, 'In Review'));
        expect(await a.getDeclineBidButtonCount(), 'Decline Bid still offered after Cancel').toBeGreaterThan(0);
      });

      // Covers: MSG_007
      const failure = await test.step('Make every non-read Apex call fail (reads are get*/existing*/Eligible*)', async () => {
        return a.failApexCalls(/^(?!get|existing|Eligible)/i);
      });

      try {
        await test.step('A backend failure while declining shows "Error in updating Bid Status"', async () => {
          await a.openBidDecision('Decline');
          await a.confirmBidDecision('Decline');
          const toast = await a.waitForToastText();
          Logger.log(`  [Decline] simulated failure of ${JSON.stringify(failure.failed)} → toast "${toast}"`);
          expect(failure.failed.length, 'the decline made an update call').toBeGreaterThan(0);
          expect(toast).toContain('Error in updating Bid Status');
        });
      } finally {
        await test.step('Restore the Apex calls and clear the error toast', async () => {
          await failure.restore();
          await a.dismissToasts();
        });
      }

      await test.step('Verify the failed decline left the bid In Review', async () => {
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        expect(await a.getDealDialogText(), 'bid unchanged').toMatch(franchiseStatusPattern(BIDDER, 'In Review'));
      });

      // Covers: SAN_043, BW_029, MSG_014, SMK_011, BW_032
      await test.step('Confirming Decline Bid declines it — the Listing Franchise sees it as Declined', async () => {
        await a.openBidDecision('Decline');
        await a.confirmBidDecision('Decline');
        const toast = await a.waitForToastText();
        Logger.log(`  [Decline] toast: "${toast}"`);
        expect(toast).toMatch(/Bid has been Declined/i);
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        expect(await a.getDealDialogText()).toMatch(franchiseStatusPattern(BIDDER, 'Declined', 'Lost'));
        expect(await a.isBidActionEnabled('Accept'), 'A declined bid can no longer be accepted').toBe(false);
        expect(await a.isBidActionEnabled('Decline'), 'A declined bid can no longer be declined').toBe(false);
        await a.close();
      });

      // Covers: SAN_043, BW_030, BW_031
      await test.step('The other franchise finds the deal under My Bids > Lost, not under In Review', async () => {
        await otherFranchiseMarketplacePage.bringToFront();
        await otherFranchiseMarketplacePage.navigate();
        await otherFranchiseMarketplacePage.expectMarketplaceLoaded();
        await otherFranchiseMarketplacePage.selectDealStatus('My Bids');
        await otherFranchiseMarketplacePage.selectBidStage('Lost');
        await otherFranchiseMarketplacePage.applyFilters();
        await otherFranchiseMarketplacePage.expectMarketplaceLoaded();
        expect(await otherFranchiseMarketplacePage.getAllCardMpdIds(), 'Declined bid under My Bids > Lost').toContain(
          deal.mpdId,
        );

        await otherFranchiseMarketplacePage.selectBidStage('In Review');
        await otherFranchiseMarketplacePage.applyFilters();
        await otherFranchiseMarketplacePage.expectMarketplaceLoaded();
        expect(
          await otherFranchiseMarketplacePage.getAllCardMpdIds(),
          'Declined bid not under My Bids > In Review',
        ).not.toContain(deal.mpdId);
      });

      // Covers: MSG_019, BW_016
      await test.step("Reopening the deal, the other franchise's in-screen message shows the bid as Lost and offers no Withdraw Bid", async () => {
        expect(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'My Bids', BIDDER)).toBe(true);
        const text = await b.getDealDialogText();
        expect(text).toMatch(alreadyBidPattern(BIDDER));
        expect(text).toMatch(/Current bid status:?\s*-?\s*(Bid )?(Lost|Declined)/i);
        expect(await b.hasWithdrawBidOption()).toBe(false);
        await b.close();
      });
    },
  );
});

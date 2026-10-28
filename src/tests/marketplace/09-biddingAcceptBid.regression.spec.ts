import { test, expect } from '@fixtures/testFixtures';
import { envConfig } from '@config/env.config';
import { listFreshDeal, openDealAs, openDealInSecondTab, placeBidAs } from '@utils/directInvite';
import { tileWindow } from '@utils/windowLayout';
import { Logger } from '@utils/logger';
import { labelledValuePattern } from '@modules/marketplace';
import { openFirstDealWhere } from '@utils/dealScan';

/**
 * Workflow suite for the Marketplace_Master sheet's workflow:
 * "Bidding: Accept Bid"
 * (see the sheet's Workflow Summary / Automation Categorization tabs).
 *
 * Two franchises side by side: Franchise A (authedPage, left window) lists a
 * brand-new seller op as Opportunity with no Direct Invite, its owner's other
 * franchise (otherFranchisePage, a second tab of the same login, right window)
 * bids on it, and Franchise A accepts that bid. Franchise B never sees Franchise
 * A's deals (QA 2026-10-26), so it can't be the bidder. One end-to-end journey,
 * each sheet case a test.step. One-way: adds 1 Opportunity per run, which ends
 * up owned by the other franchise.
 *
 * The "cannot withdraw once accepted" guards are reached through a second
 * tab per franchise opened BEFORE the accept: the refreshed UI simply drops
 * the Withdraw buttons, so only a stale view can still click them.
 */

const BIDDER = envConfig.FRANCHISE_A_OTHER_NAME;
const BID_REASON = 'Bid to be accepted';

test.describe('Bidding: Accept Bid — two franchises side by side @regression @MarketplaceBiddingAcceptBid @TwoAccount', () => {
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

  // Covers: SAN_038/SAN_039/SAN_045/BW_019/SD_018/SAN_055/MSG_005/SAN_001
  test(
    "Franchise A accepts its owner's other franchise's bid @regression",
    { tag: '@ACCEPT-01' },
    async ({
      authedPage,
      otherFranchisePage,
      authedHomePage,
      authedSellerLeadPage,
      authedMarketplacePage,
      authedMarketplaceDealPage,
      otherFranchiseMarketplacePage,
      otherFranchiseMarketplaceDealPage,
      otherFranchiseSellerLeadPage,
    }) => {
      const a = authedMarketplaceDealPage;
      const b = otherFranchiseMarketplaceDealPage;

      // Covers: SAN_001
      const deal = await test.step('Franchise A (Owner) lists a new seller op as Opportunity', async () => {
        const listed = await listFreshDeal(authedHomePage, authedSellerLeadPage, authedMarketplacePage, a, 'Opportunity', '');
        await a.close();
        return listed;
      });

      // Live-verified QA 2026-10-09: Withdraw Deal is hidden while a bid is In Review,
      // so Franchise A's second tab has to be opened before the other franchise bids.
      const staleA = await test.step("Open Franchise A's deal in a second tab while it still offers Withdraw Deal", async () => {
        const tab = await openDealInSecondTab(authedPage, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME);
        expect(await tab.dealPage.hasWithdrawDealOption()).toBe(true);
        return tab;
      });

      await test.step('The other franchise bids on the deal', async () => {
        await otherFranchiseMarketplacePage.bringToFront();
        await placeBidAs(otherFranchiseMarketplacePage, b, deal.mpdId, BID_REASON, BIDDER);
        await b.close();
      });

      await test.step("Withdraw Deal is hidden on Franchise A's deal while the other franchise's bid is In Review", async () => {
        await authedMarketplacePage.bringToFront();
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        expect(await a.hasWithdrawDealOption()).toBe(false);
        await a.close();
      });

      const staleB = await test.step("Open the other franchise's bid in a second tab while it offers Withdraw Bid", async () => {
        const tab = await openDealInSecondTab(otherFranchisePage, deal.mpdId, 'My Bids', BIDDER);
        expect(await tab.dealPage.hasWithdrawBidOption()).toBe(true);
        await authedMarketplacePage.bringToFront();
        return tab;
      });

      // Covers: SAN_038, BW_020, BW_022, MSG_025
      await test.step("Accept Bid shows the confirmation with the bid's reason, gated by Terms of Use", async () => {
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        const popup = await a.openBidDecision('Accept');
        Logger.log(`  [Accept] popup: "${popup}"`);
        expect(popup).toContain('Are you sure you want to accept this Bid?');
        expect(popup).toMatch(labelledValuePattern('Reason for Bid', BID_REASON));
        expect(popup).toMatch(/Terms of Use|Terms & Conditions/);
        expect
          .soft(await a.isBidDecisionConfirmEnabled(), 'Confirm should be disabled until Terms of Use is ticked')
          .toBe(false);
      });

      // Covers: SAN_038, BW_021, BW_025, MSG_013
      await test.step('Ticking Terms of Use enables Confirm; confirming accepts the bid — success message, bid Accepted, Deal Stage Bid Accepted, Opp Transferred', async () => {
        await a.tickTermsOfUse();
        expect(await a.isBidDecisionConfirmEnabled(), 'Confirm enabled once Terms of Use is ticked').toBe(true);
        await a.confirmBidDecision('Accept');
        const toast = await a.waitForToastText();
        Logger.log(`  [Accept] toast: "${toast}"`);
        expect(toast).toContain('The Marketplace Bid has been Accepted');
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        expect(await a.getDealStage()).toBe('Bid Accepted');
        expect(await a.getAdditionalField('Opp Transferred')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        expect(await a.getDealDialogText()).toContain(`The winning franchise for this deal is: ${BIDDER}.`);
        expect(await a.hasWithdrawDealOption(), 'No Withdraw Deal once a bid is accepted').toBe(false);
        await a.close();
      });

      // Covers: SAN_038
      await test.step('The Opportunity record now belongs to the other franchise (Opportunity-type transfer)', async () => {
        await otherFranchiseSellerLeadPage.navigateById(deal.oppId);
        expect(otherFranchiseSellerLeadPage.getOpportunityIdFromUrl()).toBe(deal.oppId);
        expect(await otherFranchiseSellerLeadPage.getAccountName()).toBe(BIDDER);
      });

      // Covers: SAN_039, BW_024
      await test.step('The deal leaves Available and appears under My Listed Deals > Bid Accepted', async () => {
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'Available'),
          'Won deal must leave Available',
        ).toBe(false);
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.selectDealStatus('My Listed Deals');
        await authedMarketplacePage.selectDealStage('Bid Accepted');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        expect(await authedMarketplacePage.getAllCardMpdIds()).toContain(deal.mpdId);
      });

      // Covers: SAN_045, BW_015
      await test.step('The winning franchise is not offered Withdraw Bid on its accepted bid', async () => {
        await otherFranchiseMarketplacePage.bringToFront();
        expect(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'My Bids', BIDDER)).toBe(true);
        expect(await b.getDealDialogText()).toContain(`The winning franchise for this deal is: ${BIDDER}.`);
        expect(await b.hasWithdrawBidOption()).toBe(false);
        await b.close();
      });

      // Covers: BW_019, BW_018, MSG_010
      await test.step("Withdraw Bid from the other franchise's stale tab is refused because of the deal's stage", async () => {
        await staleB.dealPage.bringToFront();
        await staleB.dealPage.withdrawBid();
        const toast = await staleB.dealPage.waitForToastText();
        Logger.log(`  [Accept] stale Withdraw Bid toast: "${toast}"`);
        expect(toast, 'Withdrawing an accepted bid must be refused').toMatch(/^Error/);
        expect(toast).toMatch(/cannot be withdrawn/i);
        // Observed QA 2026-10-09: "A bid cannot be withdrawn once a bid has been accepted or declined.
        // Please contact support if there has been an error." — not the sheet's stage-based message.
        expect
          .soft(toast, 'Stage-based error message')
          .toMatch(/Bid cannot be withdrawn as the marketplace deal is in '?Bid Accepted'? stage/i);
        await staleB.dealPage.closeTab();
        expect(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'My Bids', BIDDER)).toBe(true);
        expect(await b.getDealDialogText(), 'The accepted bid is unaffected').toContain(
          `The winning franchise for this deal is: ${BIDDER}.`,
        );
        await b.close();
      });

      // Covers: SD_018/SAN_055/MSG_005
      await test.step("Withdraw Deal from Franchise A's stale tab is refused once a bid is accepted", async () => {
        await staleA.dealPage.bringToFront();
        await staleA.dealPage.withdrawDeal();
        const toast = await staleA.dealPage.waitForToastText();
        Logger.log(`  [Accept] stale Withdraw Deal toast: "${toast}"`);
        // Observed QA 2026-10-09 (MPD-05080): the stale Withdraw Deal SUCCEEDED ("Deal Withdrawn
        // Successfully") — the server doesn't enforce the rule the refreshed UI does by hiding the button.
        expect.soft(toast, 'Error message').toContain('A deal cannot be withdrawn once a bid has been accepted.');
        await staleA.dealPage.closeTab();
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
          'The won deal must still be listed',
        ).toBe(true);
        const stage = await a.getDealStage();
        Logger.log(`  [Accept] after stale Withdraw Deal: Deal Stage = "${stage}"`);
        expect(stage, 'The won deal must stay Bid Accepted').toBe('Bid Accepted');
        expect(await a.getDealDialogText()).toContain(`The winning franchise for this deal is: ${BIDDER}.`);
        await a.close();
      });
    },
  );
});

// Franchise A's owner also owns FRANCHISE_A_OTHER_NAME; the deal modal's Bidding Franchise
// dropdown switches which franchise they act as, so the same login is both the listing
// franchise and the bidder. No third franchise can see these deals (Franchise B never sees
// Franchise A's deals, QA 2026-10-26), so a deal here has one bidder: the rows that need two
// competing bids (BW_023 other bid set Lost, SAN_040/MSG_020 losing bidder) can't be built,
// and the losing-bidder view is checked from bid history below.
const SECOND_BIDDER = envConfig.FRANCHISE_A_OTHER_NAME;
const SECOND_REASON = "Bid as the owner's other franchise";

test.describe('Bidding: Accept Bid — one owner acting as both franchises @regression @MarketplaceBiddingAcceptBid', () => {
  test.describe.configure({ timeout: 900_000 });

  // Covers: RA_013, RA_014, RA_015, RA_037, MSG_012, SMK_010, BW_026, MSG_006
  test(
    'The owner bids as their other franchise, then as the listing franchise sees the bid and accepts it @regression',
    { tag: '@ACCEPT-02' },
    async ({ authedPage, authedHomePage, authedSellerLeadPage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const a = authedMarketplaceDealPage;

      const deal = await test.step('Franchise A lists a new seller op as Assignment', async () => {
        return listFreshDeal(authedHomePage, authedSellerLeadPage, authedMarketplacePage, a, 'Assignment', '');
      });

      await test.step('Verify the listing toast and the Assignment badge', async () => {
        // Covers: ST_001, ST_003 — the app omits the sheet's leading "The".
        expect
          .soft(deal.listToast, 'success toast after listing an Assignment deal')
          .toMatch(/Assignment deal listed to Marketplace successfully/i);
        // Covers: LF_022
        expect(await a.getDealTypeBadge(), 'Assignment deal shows the Assignment badge').toBe('Assignment');
        await a.close();
      });

      // Covers: RA_013, RA_014
      await test.step('Acting as the listing franchise the owner cannot bid; switching the Bidding Franchise to their other franchise offers Place Bid', async () => {
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        expect(await a.isEligibleToBid(), 'no Place Bid as the listing franchise').toBe(false);
        expect(await a.hasWithdrawDealOption(), 'listing franchise gets Withdraw Deal').toBe(true);
        await a.selectFranchiseIfPresent(SECOND_BIDDER);
        expect(await a.isEligibleToBid(), `Place Bid offered when acting as ${SECOND_BIDDER}`).toBe(true);
        await a.close();
      });

      // Covers: MSG_012
      await test.step("Franchise A's owner bids on the deal as their other franchise", async () => {
        expect(await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', SECOND_BIDDER)).toBe(true);
        await a.openPlaceBidConfirmation(SECOND_REASON);
        await a.submitPlaceBidConfirmation();
        expect(await a.waitForToastText()).toMatch(/successfully bid/i);
        await a.close();
      });

      // Covers: RA_015
      await test.step('Acting as the bidding franchise the owner cannot Accept or Decline bids, and is offered Withdraw Bid', async () => {
        expect(await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', SECOND_BIDDER)).toBe(true);
        await expect
          .poll(() => a.hasWithdrawBidOption(), { timeout: 15000, message: 'Withdraw Bid offered on own bid' })
          .toBe(true);
        // The listing-side buttons take a moment to go after the switch.
        await expect
          .poll(() => a.getAcceptBidButtonCount(), {
            timeout: 15000,
            message: 'no Accept Bid as the bidding franchise',
          })
          .toBe(0);
        await expect
          .poll(() => a.getDeclineBidButtonCount(), {
            timeout: 15000,
            message: 'no Decline Bid as the bidding franchise',
          })
          .toBe(0);
        await a.close();
      });

      // Covers: RA_037
      await test.step('The listing franchise sees the bid with its franchise, reason and status', async () => {
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        await expect
          .poll(() => a.getAcceptBidButtonCount(), { timeout: 15000, message: 'one Accept Bid per bid' })
          .toBe(1);
        const text = await a.getDealDialogText();
        for (const expected of [SECOND_BIDDER, SECOND_REASON])
          expect(text, `bid list shows "${expected}"`).toContain(expected);
        expect(text, 'bid status shown').toMatch(/In Review/);
      });

      // A second tab still offering Accept Bid, for the "accept again" check below.
      const staleA = await test.step('Open the deal in a second tab while it still offers Accept Bid', async () => {
        return openDealInSecondTab(authedPage, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME);
      });

      // Covers: SMK_010
      await test.step('The listing franchise accepts the bid', async () => {
        await authedMarketplacePage.bringToFront();
        const popup = await a.openBidDecisionFor('Accept', SECOND_BIDDER);
        expect(popup, 'the confirmation is for that bid').toContain(SECOND_REASON);
        await a.confirmBidDecision('Accept');
        expect(await a.waitForToastText()).toContain('The Marketplace Bid has been Accepted');
        await a.close();
      });

      // Covers: BW_026, MSG_006
      await test.step('Accepting again from a tab opened before the accept is refused — only one bid is accepted', async () => {
        await staleA.dealPage.bringToFront();
        const toastP = staleA.dealPage.waitForToastText(30000);
        // Seen QA 2026-10-11: the click itself is refused with the error toast; no confirmation opens.
        await staleA.dealPage.openBidDecisionFor('Accept', SECOND_BIDDER).then(
          () => staleA.dealPage.confirmBidDecision('Accept'),
          () => {},
        );
        const toast = await toastP;
        Logger.log(`  [Accept] accept again from stale tab: "${toast}"`);
        expect(toast, 'second accept refused').toMatch(/^Error/);
        expect(toast, 'sheet message').toContain('Only one Bid can be accepted at a time');
        await staleA.dealPage.closeTab();
        await authedMarketplacePage.bringToFront();
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        expect(await a.getDealDialogText(), 'the other franchise is still the winner').toContain(
          `The winning franchise for this deal is: ${SECOND_BIDDER}.`,
        );
        await a.close();
      });
    },
  );
});

// A losing bidder's view of a won deal, from the real bid history of the
// primary account (Franchise A has bid on other franchises' deals and lost).
test.describe('Bidding: Accept Bid — losing bidder view @regression @MarketplaceBiddingAcceptBid', () => {
  // Covers: SAN_040/MSG_020
  test(
    'A deal won by another franchise shows the "already been won … winning franchise is" message and no actions @regression',
    { tag: '@ACCEPT-03' },
    async ({ authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Open the Marketplace filtered to My Bids / Lost', async () => {
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.selectDealStatus('My Bids');
        await authedMarketplacePage.selectBidStage('Lost');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        return authedMarketplacePage.getDealCardCount();
      });

      test.skip(count === 0, 'This franchise has no lost bids in current sandbox state');

      const found = await test.step('Find a lost bid on a deal that another franchise won', async () => {
        return openFirstDealWhere(
          authedMarketplacePage,
          authedMarketplaceDealPage,
          count,
          (deal) => deal.hasWinningFranchise(),
          5,
        );
      });

      await test.step('Verify one such deal was found', async () => {
        expect(found, 'At least one lost bid should be on a deal won by another franchise').toBe(true);
      });

      await test.step('Verify the won deal shows the "already been won" message and offers no actions', async () => {
        const winner = await authedMarketplaceDealPage.getWinningFranchise();
        Logger.log(`${await authedMarketplaceDealPage.getMpdId()} won by ${winner}`);
        expect(await authedMarketplaceDealPage.getDealDialogText()).toMatch(/This Marketplace deal has already been won\./i);
        expect(winner).not.toBe(envConfig.FRANCHISE_A_NAME);
        expect(await authedMarketplaceDealPage.isEligibleToBid()).toBe(false);
        expect(await authedMarketplaceDealPage.hasWithdrawBidOption()).toBe(false);
        expect(await authedMarketplaceDealPage.hasInviteActions()).toBe(false);
        await authedMarketplaceDealPage.close();
      });
    },
  );
});

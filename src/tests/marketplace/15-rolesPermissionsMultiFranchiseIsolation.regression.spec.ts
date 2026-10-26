import { test, expect } from '../../fixtures/testFixtures';
import { MarketplacePage, MarketplaceDealPage } from '../../modules/marketplace';
import { HomePage } from '../../modules/dashboard';
import { SellerLeadPage } from '../../modules/seller';
import { envConfig } from '../../config/env.config';
import { listWithDirectInvite, openDealAs, type DirectInviteDeal } from '../../utils/directInvite';
import type { Page } from '@playwright/test';
import { tileWindow } from '../../utils/windowLayout';

/**
 * Workflow suite for the Marketplace_Master sheet's workflow:
 * "Roles, Permissions & Multi-Franchise Isolation"
 * (see the sheet's Workflow Summary / Automation Categorization tabs).
 *
 * Scope notes carried over from the former marketplaceRolesVisibility.regression.spec.ts:
 *
 * Marketplace Roles & Visibility Suite — maps to the Marketplace_Master
 * spreadsheet's "DA Role - No Visibility" (3), "Coordinator / Buyer - View
 * Only" (6), "Multi-Franchise User - Isolation" (6), "Deal Card - Visual
 * Indicators" (5), "Badge Count" (4), "View Deal - Layout" (4), "Mobile
 * Swipe Actions" (2), "Visibility Matrix - Ad Council/Full Network/Bid/
 * Auto-Win" (8) groups (~38 rows).
 *
 * Scope decisions:
 * - RA_001-003 (DA) are Out of Scope: there is no DA user on QA (2026-10-16).
 *   RA_004-009 / Delegate cases run on the Delegate (COORDINATOR_*) and Buyer (BUYER_*)
 *   logins — see the role notes above the Delegate / Buyer suites below.
 * - TC_020 (Marketplace Delegate assignment restricted to Owners/DA users),
 *   also from the retired marketplaceDeals file, remains a documented gap
 *   rather than a stub test here: delegate assignment lives on the Account
 *   page (not yet scaffolded) and needs a non-Owner login to verify the
 *   permission error.
 * - RA_010-015 (multi-franchise context isolation) assume a persistent
 *   "franchise context switcher" UI distinct from the per-bid "Bidding
 *   Franchise" dropdown already modeled on `MarketplaceDealPage` — no such
 *   switcher has been confirmed live anywhere in this framework, and the
 *   Playwright MCP browser tool has been locked ("Browser is already in
 *   use") for 4 chunks running now, so it can't be verified this session
 *   either. Deferred rather than guessed at (see [[project-marketplace-
 *   master-coverage]] for the ongoing lockout).
 * - RA_016/017 (card highlight colors): own and other franchises' cards render
 *   identically on QA — Out of Scope (Not in App).
 * - RA_019 (Assignment tag position on Mobile), RA_026/029/030 (Mobile
 *   record-view layout, swipe actions) need a mobile viewport — this
 *   framework has no mobile-emulation test infra yet.
 * - RA_031-033 (Ad Council-stage visibility matrix) need the deal stage set
 *   in Salesforce — Out of Scope (No Salesforce Access). RA_038 (bid auto-win
 *   after an expiry window) is time-based — Out of Scope.
 * - RA_036 duplicates chunk 6's BW_014/015/016 (own-bid visibility +
 *   Withdraw Bid availability by stage) — not re-tested here.
 * - New method `HomePage.getMarketplaceBadgeCount()` reuses
 *   `MarketplacePage.openFromHome()`'s already-proven-live
 *   `/^Marketplace\d*$/` merged-text pattern rather than a fresh locator —
 *   the badge lives on Home (`dashboard` module), not `marketplace`, same
 *   necessary-cross-module-touch precedent as chunk 5's `SellerLeadPage`
 *   extension.
 */

// QA role logins (user-confirmed 2026-10-16, live-checked the same day):
// - The Delegate (COORDINATOR_*) is Franchise A's Marketplace Delegate: List / View /
//   Withdraw Deal on Franchise A ops and Accept/Decline Invite all render for them.
// - The Buyer (BUYER_*) is Franchise B's Buyer and also owns a separate test franchise. In the
//   Marketplace they only ever act as that test franchise — no Marketplace CTA on Franchise B ops,
//   and none of Franchise B's listed deals reach them.
// Franchise B never sees Franchise A's deals or invites, and Franchise A never sees B's (QA
// 2026-10-26). The counterparty for the Delegate's deals is therefore Franchise A's owner acting
// as their other franchise (FRANCHISE_A_OTHER_NAME), whose deals and invites the Delegate does see.
const DELEGATE_FRANCHISE = envConfig.FRANCHISE_A_NAME;
const BUYER_FRANCHISE = envConfig.FRANCHISE_B_NAME;
const OTHER_FRANCHISE = envConfig.FRANCHISE_A_OTHER_NAME;

/** Home / Seller / Marketplace POMs for a role session (role fixtures are bare pages). */
function rolePoms(page: Page) {
  return {
    home: new HomePage(page),
    seller: new SellerLeadPage(page),
    marketplace: new MarketplacePage(page),
    dealPage: new MarketplaceDealPage(page),
  };
}

/** The owner's other franchise bids on `mpdId`. */
async function bidAsOtherFranchise(marketplace: MarketplacePage, dealPage: MarketplaceDealPage, mpdId: string, reason: string) {
  expect(await openDealAs(marketplace, dealPage, mpdId, 'Available', OTHER_FRANCHISE), `${mpdId} in the other franchise's Available deals`).toBe(true);
  await dealPage.openPlaceBidConfirmation(reason);
  await dealPage.submitPlaceBidConfirmation();
  expect(await dealPage.waitForToastText()).toMatch(/successfully bid/i);
  await dealPage.close();
}

test.describe('Roles: the Marketplace Delegate acts for the franchise owner @regression @MarketplaceRolesPermissionsMultiFranchiseIsolation @TwoAccount', () => {
  test.describe.configure({ timeout: 900_000 });

  test.beforeAll(async ({ coordinatorRolePage, otherFranchisePage }) => {
    await tileWindow(coordinatorRolePage, 'left');
    await tileWindow(otherFranchisePage, 'right');
  });

  // Covers: SD_020, SD_022, SD_023, SAN_002
  test('The Marketplace Delegate lists a seller op, opens it from View in Marketplace and withdraws it @regression', { tag: '@ROLE-01' }, async ({ coordinatorRolePage }) => {
    const d = rolePoms(coordinatorRolePage);
    let deal!: DirectInviteDeal;

    await test.step('The Delegate lists a new seller op of the franchise as Assignment', async () => {
      const listed = await listWithDirectInvite(d.home, d.seller, d.marketplace, d.dealPage, 'Assignment', '');
      expect(listed, 'Freshly created seller op must show "List in Marketplace" to the Delegate').not.toBeNull();
      deal = listed!;
      expect(await d.dealPage.hasWithdrawDealOption(), 'the Delegate gets Withdraw Deal on the listing').toBe(true);
      await d.dealPage.close();
    });

    await test.step('The seller op now offers "View in Marketplace", which opens the deal', async () => {
      await d.seller.navigateById(deal.oppId);
      expect(await d.seller.getMarketplaceCtaText()).toMatch(/^View (in )?Marketplace/);
      const opened = await d.seller.clickViewInMarketplace();
      const fromOpp = new MarketplaceDealPage(opened);
      await fromOpp.expectLoaded();
      expect(await fromOpp.getMpdId()).toBe(deal.mpdId);
      if (opened !== coordinatorRolePage) await opened.close();
      else await fromOpp.close();
    });

    await test.step('The Delegate withdraws the deal — "Deal Withdrawn Successfully" and it leaves My Listed Deals', async () => {
      expect(await openDealAs(d.marketplace, d.dealPage, deal.mpdId, 'My Listed Deals')).toBe(true);
      await d.dealPage.withdrawDeal();
      expect(await d.dealPage.waitForToastText()).toContain('Deal Withdrawn Successfully');
      expect(await openDealAs(d.marketplace, d.dealPage, deal.mpdId, 'My Listed Deals'), 'withdrawn deal leaves My Listed Deals').toBe(false);
    });
  });

  // Covers: SD_021, SAN_002
  test('The Marketplace Delegate lists with a Direct Invite that reaches the invited franchise @regression', { tag: '@ROLE-02' }, async ({
    coordinatorRolePage, otherFranchisePage, otherFranchiseMarketplacePage, otherFranchiseMarketplaceDealPage,
  }) => {
    const d = rolePoms(coordinatorRolePage);
    const o = otherFranchiseMarketplaceDealPage;
    let deal!: DirectInviteDeal;

    await test.step('The Delegate lists a new seller op with a Direct Invite to another franchise', async () => {
      const listed = await listWithDirectInvite(d.home, d.seller, d.marketplace, d.dealPage, 'Assignment', OTHER_FRANCHISE);
      expect(listed, 'Freshly created seller op must show "List in Marketplace" to the Delegate').not.toBeNull();
      deal = listed!;
      await d.dealPage.close();
    });

    await test.step('The invited franchise finds the invite under My Direct Invites with Accept/Decline Invite', async () => {
      await otherFranchisePage.bringToFront();
      expect(await openDealAs(otherFranchiseMarketplacePage, o, deal.mpdId, 'My Direct Invites', OTHER_FRANCHISE)).toBe(true);
      expect(await o.hasInviteActions()).toBe(true);
      await o.close();
    });

    await test.step('The Delegate withdraws the invited deal again', async () => {
      await coordinatorRolePage.bringToFront();
      expect(await openDealAs(d.marketplace, d.dealPage, deal.mpdId, 'My Listed Deals')).toBe(true);
      await d.dealPage.withdrawDeal();
      expect(await d.dealPage.waitForToastText()).toContain('Deal Withdrawn Successfully');
    });
  });

  // Covers: SD_024, SAN_002
  test('The Marketplace Delegate accepts a bid for the franchise @regression', { tag: '@ROLE-03' }, async ({
    coordinatorRolePage, otherFranchisePage, otherFranchiseMarketplacePage, otherFranchiseMarketplaceDealPage,
  }) => {
    const d = rolePoms(coordinatorRolePage);
    let deal!: DirectInviteDeal;

    await test.step('The Delegate lists an open Opportunity deal and another franchise bids on it', async () => {
      const listed = await listWithDirectInvite(d.home, d.seller, d.marketplace, d.dealPage, 'Opportunity', '');
      expect(listed, 'Freshly created seller op must show "List in Marketplace" to the Delegate').not.toBeNull();
      deal = listed!;
      await d.dealPage.close();
      await otherFranchisePage.bringToFront();
      await bidAsOtherFranchise(otherFranchiseMarketplacePage, otherFranchiseMarketplaceDealPage, deal.mpdId, 'Bid for the Delegate to accept');
    });

    await test.step('The Delegate accepts that bid — success message, Deal Stage Bid Accepted, the bidder wins', async () => {
      await coordinatorRolePage.bringToFront();
      expect(await openDealAs(d.marketplace, d.dealPage, deal.mpdId, 'My Listed Deals')).toBe(true);
      await d.dealPage.openBidDecisionFor('Accept', OTHER_FRANCHISE);
      await d.dealPage.confirmBidDecision('Accept');
      expect(await d.dealPage.waitForToastText()).toContain('The Marketplace Bid has been Accepted');
      expect(await openDealAs(d.marketplace, d.dealPage, deal.mpdId, 'My Listed Deals')).toBe(true);
      expect((await d.dealPage.getAdditionalFields())['Deal Stage']).toBe('Bid Accepted');
      expect(await d.dealPage.getDealDialogText()).toContain(`The winning franchise for this deal is: ${OTHER_FRANCHISE}.`);
      await d.dealPage.close();
    });
  });

  // Covers: SD_025, SAN_002
  test('The Marketplace Delegate declines a bid for the franchise @regression', { tag: '@ROLE-04' }, async ({
    coordinatorRolePage, otherFranchisePage, otherFranchiseMarketplacePage, otherFranchiseMarketplaceDealPage,
  }) => {
    const d = rolePoms(coordinatorRolePage);
    let deal!: DirectInviteDeal;

    await test.step('The Delegate lists an open Assignment deal and another franchise bids on it', async () => {
      const listed = await listWithDirectInvite(d.home, d.seller, d.marketplace, d.dealPage, 'Assignment', '');
      expect(listed, 'Freshly created seller op must show "List in Marketplace" to the Delegate').not.toBeNull();
      deal = listed!;
      await d.dealPage.close();
      await otherFranchisePage.bringToFront();
      await bidAsOtherFranchise(otherFranchiseMarketplacePage, otherFranchiseMarketplaceDealPage, deal.mpdId, 'Bid for the Delegate to decline');
    });

    await test.step('The Delegate declines that bid — the bid shows as Declined', async () => {
      await coordinatorRolePage.bringToFront();
      expect(await openDealAs(d.marketplace, d.dealPage, deal.mpdId, 'My Listed Deals')).toBe(true);
      await d.dealPage.openBidDecisionFor('Decline', OTHER_FRANCHISE);
      await d.dealPage.confirmBidDecision('Decline');
      expect(await d.dealPage.waitForToastText()).toMatch(/Bid has been Declined/i);
      expect(await openDealAs(d.marketplace, d.dealPage, deal.mpdId, 'My Listed Deals')).toBe(true);
      expect(await d.dealPage.getDealDialogText()).toMatch(new RegExp(`${OTHER_FRANCHISE}.*Declined`));
    });

    await test.step('The Delegate withdraws the deal afterwards', async () => {
      await d.dealPage.withdrawDeal();
      expect(await d.dealPage.waitForToastText()).toContain('Deal Withdrawn Successfully');
    });
  });

  // Covers: DI_016, SAN_002
  test('The invited franchise\'s Marketplace Delegate accepts a Direct Invite @regression', { tag: '@ROLE-05' }, async ({
    coordinatorRolePage, otherFranchisePage, otherFranchiseHomePage, otherFranchiseMarketplacePage, otherFranchiseMarketplaceDealPage,
  }) => {
    const d = rolePoms(coordinatorRolePage);
    let deal!: DirectInviteDeal;

    await test.step('Another franchise lists a new seller op with a Direct Invite to the Delegate\'s franchise', async () => {
      await otherFranchisePage.bringToFront();
      const listed = await listWithDirectInvite(
        otherFranchiseHomePage, new SellerLeadPage(otherFranchisePage), otherFranchiseMarketplacePage, otherFranchiseMarketplaceDealPage,
        'Assignment', DELEGATE_FRANCHISE, { accountName: OTHER_FRANCHISE },
      );
      expect(listed, 'Freshly created seller op must show "List in Marketplace"').not.toBeNull();
      deal = listed!;
      await otherFranchiseMarketplaceDealPage.close();
    });

    await test.step('The Delegate gets Accept/Decline Invite under My Direct Invites', async () => {
      await coordinatorRolePage.bringToFront();
      expect(await openDealAs(d.marketplace, d.dealPage, deal.mpdId, 'My Direct Invites')).toBe(true);
      await d.dealPage.selectFranchiseIfPresent(DELEGATE_FRANCHISE);
      expect(await d.dealPage.hasInviteActions()).toBe(true);
    });

    await test.step('The Delegate accepts the invite — the deal is won for the Delegate\'s franchise', async () => {
      await d.dealPage.openInviteConfirmation('Accept');
      await d.dealPage.confirmInvite('Accept');
      expect(await openDealAs(d.marketplace, d.dealPage, deal.mpdId, 'My Bids')).toBe(true);
      expect((await d.dealPage.getAdditionalFields())['Deal Stage']).toBe('Bid Accepted');
      expect(await d.dealPage.getDealDialogText()).toContain(`The winning franchise for this deal is: ${DELEGATE_FRANCHISE}.`);
      await d.dealPage.close();
    });
  });
});

test.describe('Roles: a Buyer has no Marketplace actions for their franchise @regression @MarketplaceRolesPermissionsMultiFranchiseIsolation @TwoAccount', () => {
  test.describe.configure({ timeout: 1_200_000 });

  test.beforeAll(async ({ franchiseBPage, buyerRolePage }) => {
    await tileWindow(franchiseBPage, 'left');
    await tileWindow(buyerRolePage, 'right');
  });

  // The Buyer's bid / invite rows (RA_008, RA_009, DI_015) need a franchise that can see Franchise B's
  // deals to bid on them or invite it; none of the QA logins can (QA 2026-10-26), so only the
  // listing side is checked here.
  // Covers: ST_005, RA_004, RA_005, RA_006, RA_007, BW_010, SAN_003, SD_026, TC_012
  test('The Buyer never gets the franchise\'s listings, and cannot bid or list for it @regression', { tag: '@ROLE-06' }, async ({
    franchiseBPage, buyerRolePage, franchiseBHomePage, franchiseBMarketplacePage, franchiseBMarketplaceDealPage,
  }) => {
    const buyer = rolePoms(buyerRolePage);
    const b = franchiseBMarketplaceDealPage;
    let listedByB!: DirectInviteDeal;

    await test.step('Franchise B lists an open deal', async () => {
      await franchiseBPage.bringToFront();
      listedByB = (await listWithDirectInvite(
        franchiseBHomePage, new SellerLeadPage(franchiseBPage), franchiseBMarketplacePage, b, 'Assignment', '', { accountName: BUYER_FRANCHISE },
      ))!;
      expect(listedByB, 'fresh seller op lists').toBeTruthy();
      await b.close();
    });

    // Covers: ST_005, RA_004
    await test.step('On the franchise\'s listed seller op the Buyer gets no List / View in Marketplace CTA', async () => {
      await buyerRolePage.bringToFront();
      await buyer.seller.navigateById(listedByB.oppId);
      await buyerRolePage.waitForTimeout(5000); // the CTA renders late for permitted users; give it the same chance
      expect(await buyer.seller.hasMarketplaceCta()).toBe(false);
    });

    // Covers: RA_004, RA_005, BW_010, TC_012
    await test.step('The Buyer can open the Marketplace, but the franchise is never offered as the Bidding Franchise', async () => {
      await buyer.marketplace.navigate();
      await buyer.marketplace.expectMarketplaceLoaded();
      expect(await buyer.marketplace.getDealCardCount(), 'the Buyer sees Available deals (as their other franchise)').toBeGreaterThan(0);
      await buyer.marketplace.openDealByIndex(0);
      await buyer.dealPage.expectLoaded();
      const options = await buyer.dealPage.getBiddingFranchiseOptions();
      console.log(`  [Buyer] Bidding Franchise options: ${JSON.stringify(options)}`);
      expect(options).not.toContain(BUYER_FRANCHISE);
      await buyer.dealPage.close();
    });

    // Covers: RA_006, RA_007, SAN_003, SD_026
    await test.step('The franchise\'s own listing never reaches the Buyer, so there is no Accept/Decline Bid or Withdraw Deal', async () => {
      expect(await openDealAs(buyer.marketplace, buyer.dealPage, listedByB.mpdId, 'My Listed Deals')).toBe(false);
      expect(await openDealAs(buyer.marketplace, buyer.dealPage, listedByB.mpdId, 'Available')).toBe(false);
    });

    await test.step('Clean up: Franchise B withdraws the deal', async () => {
      await franchiseBPage.bringToFront();
      expect(await openDealAs(franchiseBMarketplacePage, b, listedByB.mpdId, 'My Listed Deals', BUYER_FRANCHISE)).toBe(true);
      await b.withdrawDeal();
      expect(await b.waitForToastText()).toContain('Deal Withdrawn Successfully');
    });
  });
});

// Franchise A's owner also owns OTHER_FRANCHISE. There is no franchise switcher on
// the Marketplace list; the deal modal's Bidding Franchise dropdown sets the acting
// franchise (user-confirmed 2026-10-11). Franchise B's deals never reach this owner
// (QA 2026-10-26), so the owner lists the deals here as Franchise A, and checks what
// each of their two franchises sees on them.
const OWNER_FRANCHISE = envConfig.FRANCHISE_A_NAME;

test.describe('Roles: multi-franchise context isolation @regression @MarketplaceRolesPermissionsMultiFranchiseIsolation', () => {
  test.describe.configure({ timeout: 1_200_000 });

  // Covers: RA_010, RA_011, RA_012
  test('What the owner does as one franchise does not show up when acting as their other franchise @regression', { tag: '@ROLE-07' }, async ({
    authedHomePage, authedSellerLeadPage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    const a = authedMarketplaceDealPage;
    let open!: DirectInviteDeal;
    let invite!: DirectInviteDeal;

    await test.step('Franchise A lists one open deal and one Direct Invite to the owner\'s other franchise', async () => {
      open = (await listWithDirectInvite(authedHomePage, authedSellerLeadPage, authedMarketplacePage, a, 'Assignment', ''))!;
      expect(open, 'fresh seller op lists').toBeTruthy();
      await a.close();
      invite = (await listWithDirectInvite(authedHomePage, authedSellerLeadPage, authedMarketplacePage, a, 'Assignment', OTHER_FRANCHISE))!;
      expect(invite, 'fresh seller op lists').toBeTruthy();
      await a.close();
    });

    // Covers: RA_010, SAN_005
    await test.step('A bid placed as the other franchise shows as its own bid only in that franchise\'s context', async () => {
      expect(await openDealAs(authedMarketplacePage, a, open.mpdId, 'Available', OTHER_FRANCHISE)).toBe(true);
      await a.openPlaceBidConfirmation('Bid as the other franchise');
      await a.submitPlaceBidConfirmation();
      expect(await a.waitForToastText()).toMatch(/successfully bid/i);
      await a.close();

      expect(await openDealAs(authedMarketplacePage, a, open.mpdId, 'Available', OTHER_FRANCHISE)).toBe(true);
      await expect.poll(() => a.hasWithdrawBidOption(), { timeout: 15000, message: `${OTHER_FRANCHISE} sees its bid (Withdraw Bid)` }).toBe(true);
      await a.selectFranchiseIfPresent(OWNER_FRANCHISE);
      await expect.poll(() => a.hasWithdrawBidOption(), { timeout: 15000, message: `${OWNER_FRANCHISE} does not see that bid as its own` }).toBe(false);
      expect(await a.hasAlreadyBidMessage(), `no "already bid" message for ${OWNER_FRANCHISE}`).toBe(false);
      // As the listing franchise it sees the bid as one to Accept/Decline instead.
      await expect.poll(() => a.getAcceptBidButtonCount(), { timeout: 15000, message: `${OWNER_FRANCHISE} gets Accept Bid on it` }).toBe(1);
      await a.close();
    });

    // Covers: RA_011
    await test.step('A Direct Invite to the other franchise offers Accept/Decline only in that franchise\'s context', async () => {
      expect(await openDealAs(authedMarketplacePage, a, invite.mpdId, 'My Direct Invites', OTHER_FRANCHISE), 'invited deal reachable').toBe(true);
      await expect.poll(() => a.hasInviteActions(), { timeout: 15000, message: `${OTHER_FRANCHISE} sees Accept/Decline Invite` }).toBe(true);
      await a.selectFranchiseIfPresent(OWNER_FRANCHISE);
      await expect.poll(() => a.hasInviteActions(), { timeout: 15000, message: `${OWNER_FRANCHISE} sees no invite actions` }).toBe(false);
      await a.close();
    });

    // Covers: RA_012
    await test.step('Once the other franchise accepts the invite, the owner\'s franchise sees it as won by the other franchise, with no actions', async () => {
      expect(await openDealAs(authedMarketplacePage, a, invite.mpdId, 'My Direct Invites', OTHER_FRANCHISE)).toBe(true);
      await a.openInviteConfirmation('Accept');
      await a.confirmInvite('Accept');
      await a.close();
      expect(await openDealAs(authedMarketplacePage, a, invite.mpdId, 'My Bids')).toBe(true);
      await a.selectFranchiseIfPresent(OWNER_FRANCHISE);
      await expect.poll(() => a.getDealDialogText(), { timeout: 15000 }).toContain(`The winning franchise for this deal is: ${OTHER_FRANCHISE}.`);
      expect(await a.isEligibleToBid(), 'no Place Bid').toBe(false);
      expect(await a.hasWithdrawBidOption(), 'no Withdraw Bid').toBe(false);
      expect(await a.hasInviteActions(), 'no invite actions').toBe(false);
      await a.close();
    });

    await test.step('Clean up: the other franchise withdraws its bid and Franchise A withdraws the open deal', async () => {
      expect(await openDealAs(authedMarketplacePage, a, open.mpdId, 'Available', OTHER_FRANCHISE)).toBe(true);
      await a.withdrawBid();
      await a.close();
      expect(await openDealAs(authedMarketplacePage, a, open.mpdId, 'My Listed Deals', OWNER_FRANCHISE)).toBe(true);
      await a.withdrawDeal();
      expect(await a.waitForToastText()).toContain('Deal Withdrawn Successfully');
      await a.close();
    });
  });
});

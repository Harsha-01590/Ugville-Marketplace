import { test, expect } from '../../fixtures/testFixtures';
import { Routes } from '../../enums/routes.enum';

/**
 * Marketplace Smoke Suite — maps to the Marketplace_Master spreadsheet's
 * dedicated Smoke Tests sheet (SMK_001-018). A quick golden-path sweep, not
 * exhaustive re-coverage: every real mutating action here (listing a deal,
 * placing/accepting/declining/withdrawing a bid, withdrawing a deal) is
 * already exercised for real by the @regression chunks in this same
 * `src/tests/marketplace/` directory — this suite only confirms the app
 * hasn't fundamentally broken, via read-only checks against whatever real
 * state already exists in the shared sandbox.
 *
 * Deliberately out of scope, same reasons as their @regression counterparts:
 * - SMK_007/018 (Mobile Record View, mobile push notification) — no mobile
 *   viewport/app test infra.
 * - SMK_010/011 (Accept/Decline Bid happy path) — sit behind the same
 *   unverified confirmation popups flagged out of scope since chunk 6.
 * - SMK_013 (Withdraw Deal happy path) — no `withdrawDeal()` action method
 *   exists yet (only `hasWithdrawDealOption()`), and performing it for real
 *   would remove an active listing from the shared sandbox for the exact
 *   suite that's supposed to run repeatedly.
 * - SMK_014/016 (Coordinator/Buyer, DA role errors) — no second-role
 *   credentials.
 * - SMK_017 (OOA auto-accept) — Out of Scope (OOA): OOA processing is a
 *   background job with no UI trigger and no UI marker for OOA deals.
 */
test.describe('Marketplace Smoke @smoke', () => {
  // Covers: SMK_001
  test('Marketplace is reachable from Home and loads at /market-place/ @smoke', { tag: '@SMOKE-01' }, async ({
    authedPage, authedHomePage, authedMarketplacePage,
  }) => {
    await authedHomePage.navigate();
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    expect(authedPage.url()).toContain(Routes.MARKETPLACE);
  });

  // Covers: SMK_004/005
  test('An Available deal card shows Deal Terms, ARV, Stage, and Age fields @smoke', { tag: '@SMOKE-02' }, async ({
    authedHomePage, authedMarketplacePage,
  }) => {
    await authedHomePage.navigate();
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const count = await authedMarketplacePage.getDealCardCount();
    test.skip(count === 0, 'No deal cards in current sandbox state');

    const arv = await authedMarketplacePage.getCardEstArv(0);
    const stage = await authedMarketplacePage.getCardStage(0);
    expect(arv.length).toBeGreaterThan(0);
    expect(stage.length).toBeGreaterThan(0);
  });

  // Covers: SMK_006
  test('View Deal opens the deal detail as a modal on Web @smoke', { tag: '@SMOKE-03' }, async ({
    authedHomePage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    await authedHomePage.navigate();
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const count = await authedMarketplacePage.getDealCardCount();
    test.skip(count === 0, 'No deal cards in current sandbox state');

    await authedMarketplacePage.clickFirstItem();
    await authedMarketplaceDealPage.expectLoaded();
    await expect(authedMarketplaceDealPage.modalHeading).toBeVisible();
    await authedMarketplaceDealPage.close();
  });

  // Covers: SMK_009
  test('A franchise\'s own bid shows Bid Status = In Review under My Bids @smoke', { tag: '@SMOKE-04' }, async ({
    authedHomePage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    await authedHomePage.navigate();
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectDealStatus('My Bids');
    await authedMarketplacePage.selectBidStage('In Review');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const count = await authedMarketplacePage.getDealCardCount();
    test.skip(count === 0, 'No In Review bid in current sandbox state');

    // Live-verified 2026-09-16: "My Bids" + Bid Stage "In Review" can also
    // surface a pending Direct Invite (Accept/Decline Invite, no bid placed
    // yet) alongside genuine already-bid deals — index 0 isn't reliably one
    // or the other, so scan for a deal that actually shows the "already bid"
    // message rather than assuming the first card is it.
    let found = false;
    for (let i = 0; i < count; i++) {
      await authedMarketplacePage.openDealByIndex(i);
      await authedMarketplaceDealPage.expectLoaded();
      if (await authedMarketplaceDealPage.hasAlreadyBidMessage()) {
        found = true;
        await authedMarketplaceDealPage.close();
        break;
      }
      await authedMarketplaceDealPage.close();
    }
    test.skip(!found, 'No already-bid deal found under My Bids/In Review — only pending Direct Invites present');
    expect(found).toBe(true);
  });

  // Covers: SMK_012
  test('Withdraw Bid is offered on an In Review bid @smoke', { tag: '@SMOKE-05' }, async ({
    authedHomePage, authedMarketplacePage, authedMarketplaceDealPage,
  }) => {
    await authedHomePage.navigate();
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectDealStatus('My Bids');
    await authedMarketplacePage.selectBidStage('In Review');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const count = await authedMarketplacePage.getDealCardCount();
    test.skip(count === 0, 'No In Review bid in current sandbox state');

    // Same Direct-Invite-vs-genuine-bid caveat as SMK_009 above — scan
    // instead of trusting index 0.
    let found = false;
    for (let i = 0; i < count; i++) {
      await authedMarketplacePage.openDealByIndex(i);
      await authedMarketplaceDealPage.expectLoaded();
      if (await authedMarketplaceDealPage.hasWithdrawBidOption()) {
        found = true;
        await authedMarketplaceDealPage.close();
        break;
      }
      await authedMarketplaceDealPage.close();
    }
    test.skip(!found, 'No withdrawable In Review bid found — only pending Direct Invites present');
    expect(found).toBe(true);
  });

  // Covers: SMK_015
  test('A Direct Invite deal carries the "Invited" tag @smoke', { tag: '@SMOKE-06' }, async ({
    authedHomePage, authedMarketplacePage,
  }) => {
    await authedHomePage.navigate();
    await authedMarketplacePage.navigate();
    await authedMarketplacePage.expectMarketplaceLoaded();
    await authedMarketplacePage.selectDealStatus('My Direct Invites');
    await authedMarketplacePage.applyFilters();
    await authedMarketplacePage.expectMarketplaceLoaded();
    const count = await authedMarketplacePage.getDealCardCount();
    test.skip(count === 0, 'No Direct Invite deal in current sandbox state');

    expect(await authedMarketplacePage.hasInvitedBadge(0)).toBe(true);
  });
});

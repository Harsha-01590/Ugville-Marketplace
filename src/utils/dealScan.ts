import { expect } from '@playwright/test';
import type { MarketplacePage, MarketplaceDealPage } from '@modules/marketplace';
import { Logger } from './logger';

/**
 * Opens the first `count` deal cards (at most `max`) in turn and stops at the first whose modal
 * passes `check`, leaving that modal open; every other modal is closed again.
 * Used where a filter (e.g. My Bids + In Review) mixes genuine bids with
 * pending Direct Invites, so index 0 can't be trusted to be the wanted kind.
 */
export async function openFirstDealWhere(
  marketplace: MarketplacePage,
  dealPage: MarketplaceDealPage,
  count: number,
  check: (deal: MarketplaceDealPage) => Promise<boolean>,
  max = Infinity,
): Promise<boolean> {
  for (let i = 0; i < Math.min(count, max); i++) {
    await marketplace.openDealByIndex(i);
    await dealPage.expectLoaded();
    if (await check(dealPage)) return true;
    await dealPage.close();
  }
  return false;
}

/**
 * Scans up to `maxScan` of this franchise's In Review bids for one that offers
 * Withdraw Bid and withdraws it. Re-navigates and re-applies the filters before
 * each card, since page.goBack() doesn't reliably restore them.
 */
export async function withdrawFirstWithdrawableInReviewBid(
  marketplace: MarketplacePage,
  dealPage: MarketplaceDealPage,
  maxScan: number,
): Promise<boolean> {
  for (let i = 0; i < maxScan; i++) {
    await marketplace.navigate();
    await marketplace.expectMarketplaceLoaded();
    await marketplace.selectDealStatus('My Bids');
    await marketplace.selectBidStage('In Review');
    await marketplace.applyFilters();
    await marketplace.expectMarketplaceLoaded();
    if (i >= (await marketplace.getDealCardCount())) return false;

    await marketplace.openDealByIndex(i).catch(() => {});
    await dealPage.expectLoaded().catch(() => {});
    if (await dealPage.hasWithdrawBidOption()) {
      Logger.log(`Withdraw Bid option present on In Review bid index ${i}`);
      await dealPage.withdrawBid();
      return true;
    }
  }
  return false;
}

/**
 * Opens each of `mpdIds` and returns the ones whose modal shows the Google property
 * image rather than the placeholder drawing, logging which image every deal showed.
 */
export async function dealsShowingGoogleImage(
  marketplace: MarketplacePage,
  dealPage: MarketplaceDealPage,
  mpdIds: string[],
): Promise<string[]> {
  const google: string[] = [];
  const summary: string[] = [];
  for (const id of mpdIds) {
    expect(await marketplace.openDealByMpdId(id)).toBe(true);
    await dealPage.expectLoaded();
    await expect.poll(() => dealPage.getMpdId(), { timeout: 10000 }).toBe(id);
    const isGoogle = await dealPage.showsGooglePropertyImage();
    if (isGoogle) google.push(id);
    summary.push(`${id}=${isGoogle ? 'Google' : 'placeholder'}`);
    await dealPage.close();
    await dealPage.waitForDealDialogHidden();
  }
  Logger.log(`Deal images: ${summary.join(', ')}`);
  return google;
}

import { type Page, expect } from '@playwright/test';
import { envConfig } from '@config/env.config';
import type { HomePage } from '@modules/dashboard';
import type { SellerLeadPage, MarketplaceDealType } from '@modules/seller';
import {
  MarketplacePage,
  MarketplaceDealPage,
  type DealStatus,
  type MarketplaceBidStage,
  type MarketplaceDealStage,
} from '@modules/marketplace';
import { Logger } from './logger';

export interface DirectInviteDeal {
  mpdId: string;
  oppName: string;
  dealTerms: string;
  oppDetails: string;
  /** Salesforce id of the listed (original) Opportunity, and the listing franchise's Account on it. */
  oppId: string;
  listingAccount: string;
  /** Toast shown on Save of the listing form ('' if none appeared). */
  listToast: string;
}

/** Salesforce record id from an Opportunity URL ('' if none). */
export function opportunityIdFrom(url: string): string {
  return url.match(/\/opportunity\/([A-Za-z0-9]{15,18})/)?.[1] ?? '';
}

/**
 * Franchise A's half of the two-account Direct Invite flow: creates a brand-new
 * seller op from scratch on Home (under `opts.accountName`, default FRANCHISE_A_NAME), runs
 * `opts.beforeList` on it (e.g. log a call), lists it as `type`
 * with only the required fields plus a Direct Invite to `invitee` (an empty
 * `invitee` lists it with no Direct Invite, for the open bidding flow), then reads
 * the new MPD id back from My Listed Deals (newest first), matched on a unique
 * Deal Terms token so a concurrent listing can't be mistaken for this one.
 * Creating fresh means the run never depends on (or exhausts) Home's existing
 * seller ops. Leaves the new deal open on My Listed Deals so the caller can
 * check it without reopening. Returns null when the new op isn't listable.
 */
export async function listWithDirectInvite(
  home: HomePage,
  seller: SellerLeadPage,
  marketplace: MarketplacePage,
  dealPage: MarketplaceDealPage,
  type: MarketplaceDealType,
  invitee: string,
  opts: { accountName?: string; beforeList?: () => Promise<void> } = {},
): Promise<DirectInviteDeal | null> {
  const oppName = await seller.createFromHome(home, opts.accountName ?? envConfig.FRANCHISE_A_NAME);
  if (!(await seller.isListInMarketplaceCtaShown())) {
    Logger.log(
      `  [DirectInvite] new seller op ${oppName} shows "${await seller.getMarketplaceCtaText()}", not "List in Marketplace"`,
    );
    return null;
  }
  await opts.beforeList?.();

  const oppId = opportunityIdFrom(seller.page.url());
  const listingAccount = await seller.getAccountName();
  const dealTerms = `${invitee ? 'Direct Invite ' : ''}${type} ${Date.now()}`;
  await seller.clickMarketplaceCta();
  const form = seller.marketplaceListing;
  await form.selectDealType(type);
  await form.fillDealTerms(dealTerms);
  const oppDetails = invitee ? `Direct Invite (${type}) to ${invitee}` : `${type} listing`;
  await form.fillOpportunityDetails(oppDetails);
  if (invitee) await form.selectDirectInviteFranchise(invitee);
  await form.save();
  const listToast = await dealPage.waitForToastText().catch(() => '');

  // Acting as the listing franchise: an owner of several franchises may have switched the
  // Bidding Franchise dropdown to another one in a different tab of the same login.
  if (!(await openDealAs(marketplace, dealPage, null, 'My Listed Deals', listingAccount))) {
    throw new Error('My Listed Deals is empty right after saving a listing');
  }
  const mpdId = await dealPage.getMpdId();
  // Seen QA 2026-10-21: the modal's MPD id can render before its Deal Terms, so give the body a moment.
  let text = '';
  for (let i = 0; i < 10 && !text.includes(dealTerms); i++) {
    if (i) await dealPage.page.waitForTimeout(1000);
    text = await dealPage.getDealDialogText();
  }
  if (!text.includes(dealTerms)) {
    throw new Error(`Newest listed deal ${mpdId} is not the one just saved (Deal Terms "${dealTerms}" not found)`);
  }
  Logger.log(
    `  [DirectInvite] ${oppName} listed as ${type} → ${mpdId}${invitee ? `, invited ${invitee}` : ', no Direct Invite'}`,
  );
  return { mpdId, oppName, dealTerms, oppDetails, oppId, listingAccount, listToast };
}

/**
 * `listWithDirectInvite` for tests that need the listing to succeed: fails with
 * a clear error instead of returning null when the fresh seller op can't be listed.
 */
export async function listFreshDeal(
  home: HomePage,
  seller: SellerLeadPage,
  marketplace: MarketplacePage,
  dealPage: MarketplaceDealPage,
  type: MarketplaceDealType,
  invitee: string,
  opts: { accountName?: string; beforeList?: () => Promise<void> } = {},
): Promise<DirectInviteDeal> {
  const deal = await listWithDirectInvite(home, seller, marketplace, dealPage, type, invitee, opts);
  if (!deal) throw new Error('A freshly created seller op must show "List in Marketplace", but it did not');
  return deal;
}

/**
 * Lists a fresh seller op as `type` with only the required fields (no ARV, no
 * Direct Invite), checks the listing toast, blank ARV and non-Direct stage, then
 * confirms the Opportunity's CTA flipped to "View in Marketplace". Returns the
 * deal's type badge.
 */
export async function listWithRequiredFieldsOnly(
  type: MarketplaceDealType,
  home: HomePage,
  seller: SellerLeadPage,
  marketplace: MarketplacePage,
  dealPage: MarketplaceDealPage,
): Promise<string> {
  const deal = await listFreshDeal(home, seller, marketplace, dealPage, type, '');
  // The app words it "<Type> Deal listed to Marketplace successfully." (sheet: "The <type> deal listed…").
  expect(deal.listToast, 'success toast').toMatch(new RegExp(`${type} deal listed to Marketplace successfully`, 'i'));
  expect(await dealPage.getDealDialogText(), 'Estimated ARV left blank').toContain('Estimated ARV: N/A');
  expect(await dealPage.getDealStage(), 'no Direct Invite').not.toBe('Direct');
  const badge = await dealPage.getDealTypeBadge();
  Logger.log(`  [Form] ${deal.mpdId} listed as ${type}, badge "${badge}"`);
  await dealPage.close();
  await seller.navigateById(deal.oppId);
  await expect.poll(() => seller.getMarketplaceCtaText(), { timeout: 30000 }).toMatch(/^View (in )?Marketplace/);
  return badge;
}

/**
 * Opens `mpdId` (or the first card when null) under a Deal Status filter; false if it isn't listed there.
 * With `franchise`, then switches the Bidding Franchise dropdown to it — the acting franchise for an
 * owner of several franchises (e.g. FRANCHISE_A_OTHER_NAME on Franchise A's deals).
 */
export async function openDealAs(
  marketplace: MarketplacePage,
  dealPage: MarketplaceDealPage,
  mpdId: string | null,
  status?: DealStatus,
  franchise?: string,
): Promise<boolean> {
  await marketplace.navigate();
  await marketplace.expectMarketplaceLoaded();
  if (status) {
    await marketplace.selectDealStatus(status);
    await marketplace.applyFilters();
    await marketplace.expectMarketplaceLoaded();
  }
  if (mpdId === null) {
    if ((await marketplace.getDealCardCount()) === 0) return false;
    await marketplace.openDealByIndex(0);
  } else if (!(await marketplace.openDealByMpdId(mpdId))) {
    return false;
  }
  await dealPage.expectLoaded();
  if (franchise) await dealPage.selectFranchiseIfPresent(franchise);
  return true;
}

export interface SecondTab {
  tab: Page;
  marketplace: MarketplacePage;
  dealPage: MarketplaceDealPage;
}

/** Opens `mpdId` under My Listed Deals + a Deal Stage, with filters reset first; false if it isn't listed there. */
export async function openListedDealUnderStage(
  marketplace: MarketplacePage,
  dealPage: MarketplaceDealPage,
  mpdId: string,
  stage: MarketplaceDealStage,
): Promise<boolean> {
  await marketplace.showList('My Listed Deals');
  await marketplace.selectDealStage(stage);
  await marketplace.applyFilters();
  await marketplace.expectMarketplaceLoaded();
  if (!(await marketplace.openDealByMpdId(mpdId))) return false;
  await dealPage.expectLoaded();
  return true;
}

/** Opens `mpdId` under My Bids + a Bid Stage, with filters reset first; false if it isn't listed there. */
export async function openBidDealUnderStage(
  marketplace: MarketplacePage,
  dealPage: MarketplaceDealPage,
  mpdId: string,
  stage: MarketplaceBidStage,
): Promise<boolean> {
  await marketplace.showList('My Bids');
  await marketplace.selectBidStage(stage);
  await marketplace.applyFilters();
  await marketplace.expectMarketplaceLoaded();
  if (!(await marketplace.openDealByMpdId(mpdId))) return false;
  await dealPage.expectLoaded();
  return true;
}

/**
 * Opens `mpdId` in a second tab of `page`'s session (same login) and leaves it
 * open there. The tab's view goes stale once the other window changes the deal
 * (bid placed, accepted, withdrawn), so acting on it reaches the server-side
 * guards ("Bid Record Already Exists…", "…cannot be withdrawn…") that the
 * refreshed UI hides by removing the button. Close the returned page when done.
 */
export async function openDealInSecondTab(
  page: Page,
  mpdId: string,
  status?: DealStatus,
  franchise?: string,
): Promise<SecondTab> {
  const tab = await page.context().newPage();
  const marketplace = new MarketplacePage(tab);
  const dealPage = new MarketplaceDealPage(tab);
  if (!(await openDealAs(marketplace, dealPage, mpdId, status, franchise))) {
    await tab.close();
    throw new Error(`${mpdId} is not listed under ${status ?? 'the default filter'} in the second tab`);
  }
  return { tab, marketplace, dealPage };
}

/**
 * The bidding franchise's half of the open (no Direct Invite) flow: opens `mpdId` from Available
 * and bids with `reason`, as `franchise` when given (see openDealAs).
 */
export async function placeBidAs(
  marketplace: MarketplacePage,
  dealPage: MarketplaceDealPage,
  mpdId: string,
  reason: string,
  franchise?: string,
): Promise<void> {
  if (!(await openDealAs(marketplace, dealPage, mpdId, 'Available', franchise))) {
    throw new Error(`${mpdId} is not in the bidding franchise's Available deals`);
  }
  await dealPage.openPlaceBidConfirmation(reason);
  await dealPage.submitPlaceBidConfirmation();
  await dealPage
    .getMessageText(/You have successfully bid(ed)? for this Deal/)
    .waitFor({ state: 'visible', timeout: 30000 })
    .catch(() => {});
  await dealPage.waitForStabilization(2000);
  Logger.log(`  [Bid] placed a bid on ${mpdId}`);
}

/**
 * The bidding franchise bids on `mpdId` straight from its already-open Available
 * list (no reload first), acting as `franchise`, and closes the modal.
 */
export async function bidFromOpenList(
  marketplace: MarketplacePage,
  dealPage: MarketplaceDealPage,
  mpdId: string,
  reason: string,
  franchise: string,
): Promise<void> {
  await marketplace.bringToFront();
  expect(await marketplace.openDealByMpdId(mpdId), `${mpdId} is on the open list`).toBe(true);
  await dealPage.expectLoaded();
  await dealPage.selectFranchiseIfPresent(franchise);
  await dealPage.openPlaceBidConfirmation(reason);
  await dealPage.submitPlaceBidConfirmation();
  expect(await dealPage.waitForToastText()).toMatch(/successfully bid/i);
  await dealPage.close();
}

/**
 * After a rejected bid attempt: clears its toast and confirmation popup, and
 * reopens `mpdId` from Available (as `franchise`) if the rejection also closed the modal.
 */
export async function reopenAfterRejectedBid(
  marketplace: MarketplacePage,
  dealPage: MarketplaceDealPage,
  mpdId: string,
  franchise: string,
): Promise<void> {
  await dealPage.dismissToasts();
  await dealPage.cancelPlaceBidConfirmation();
  if (!(await dealPage.isOpen())) {
    expect(await openDealAs(marketplace, dealPage, mpdId, 'Available', franchise)).toBe(true);
  }
}

/**
 * Clicks the seller op's "View in Marketplace" CTA and returns the deal modal it
 * opened — in this tab, or in a new one when the CTA opens the deal in a new tab.
 */
export async function openDealFromOpportunity(seller: SellerLeadPage): Promise<MarketplaceDealPage> {
  const dealPage = new MarketplaceDealPage(await seller.clickViewInMarketplace());
  await dealPage.expectLoaded();
  return dealPage;
}

/** Closes a deal opened by `openDealFromOpportunity()`: its extra tab when it opened one, else just the modal. */
export async function closeDealFromOpportunity(seller: SellerLeadPage, dealPage: MarketplaceDealPage): Promise<void> {
  if (dealPage.page !== seller.page) await dealPage.closeTab();
  else await dealPage.close();
}

/** Opens `mpdId` from Available as `franchise`, bids with `reason`, asserts the success toast and closes the modal. */
export async function placeBidExpectingSuccess(
  marketplace: MarketplacePage,
  dealPage: MarketplaceDealPage,
  mpdId: string,
  reason: string,
  franchise: string,
): Promise<void> {
  expect(
    await openDealAs(marketplace, dealPage, mpdId, 'Available', franchise),
    `${mpdId} in ${franchise}'s Available deals`,
  ).toBe(true);
  await dealPage.openPlaceBidConfirmation(reason);
  await dealPage.submitPlaceBidConfirmation();
  expect(await dealPage.waitForToastText()).toMatch(/successfully bid/i);
  await dealPage.close();
}

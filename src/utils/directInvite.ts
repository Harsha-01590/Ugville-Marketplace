import type { Page } from '@playwright/test';
import { envConfig } from '../config/env.config';
import type { HomePage } from '../modules/dashboard';
import type { SellerLeadPage, MarketplaceDealType } from '../modules/seller';
import { MarketplacePage, MarketplaceDealPage, type DealStatus } from '../modules/marketplace';

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
    console.log(`  [DirectInvite] new seller op ${oppName} shows "${await seller.getMarketplaceCtaText()}", not "List in Marketplace"`);
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
  console.log(`  [DirectInvite] ${oppName} listed as ${type} → ${mpdId}${invitee ? `, invited ${invitee}` : ', no Direct Invite'}`);
  return { mpdId, oppName, dealTerms, oppDetails, oppId, listingAccount, listToast };
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

/**
 * Opens `mpdId` in a second tab of `page`'s session (same login) and leaves it
 * open there. The tab's view goes stale once the other window changes the deal
 * (bid placed, accepted, withdrawn), so acting on it reaches the server-side
 * guards ("Bid Record Already Exists…", "…cannot be withdrawn…") that the
 * refreshed UI hides by removing the button. Close the returned page when done.
 */
export async function openDealInSecondTab(page: Page, mpdId: string, status?: DealStatus, franchise?: string) {
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
export async function placeBidAs(marketplace: MarketplacePage, dealPage: MarketplaceDealPage, mpdId: string, reason: string, franchise?: string) {
  if (!(await openDealAs(marketplace, dealPage, mpdId, 'Available', franchise))) {
    throw new Error(`${mpdId} is not in the bidding franchise's Available deals`);
  }
  await dealPage.openPlaceBidConfirmation(reason);
  await dealPage.submitPlaceBidConfirmation();
  await dealPage.page.getByText(/You have successfully bid(ed)? for this Deal/).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  await dealPage.waitForStabilization(2000);
  console.log(`  [Bid] placed a bid on ${mpdId}`);
}

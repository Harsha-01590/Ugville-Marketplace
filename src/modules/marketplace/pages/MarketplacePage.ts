import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../../../shared/pages/base/BasePage';
import { Routes } from '../../../enums/routes.enum';
import { Logger } from '../../../utils/logger';

export type DealStatus = 'Available' | 'My Direct Invites' | 'My Listed Deals' | 'My Bids' | 'Archived';
export type DealType = 'All' | 'Assignment' | 'Opportunity';
export type MarketplaceView = 'Grid' | 'List' | 'Map';
export type MarketplaceStage =
  | 'All Stages' | 'Lead Queue' | 'Contact' | 'Appointment' | 'Offer' | 'Contract' | 'Buy Closing';
/** Sub-filter that only renders once Deal Status = "My Listed Deals" is selected. */
export type MarketplaceDealStage =
  | 'All' | 'Pending Bid Review' | 'Direct' | 'Ad Council' | 'Full Network' | 'Bid Accepted';
/** Sub-filter that only renders once Deal Status = "My Bids" is selected. */
export type MarketplaceBidStage = 'All' | 'In Review' | 'Accepted' | 'Lost';

/**
 * Page Object for the Marketplace listing (`/ugville/market-place` — note the
 * hyphen; the app's own route differs from what you might guess from the nav
 * label). Live-verified against the QA sandbox: the listing is a single SPA
 * view with a search bar, a slide-out Filters panel, Grid/List/Map view
 * switcher, and a deal card grid. Opening a deal ("View Deal") shows its
 * detail as a modal dialog — see `MarketplaceDealPage`, not a page nav.
 */
export class MarketplacePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ==================== Navigation ====================

  /**
   * Click the "Marketplace" quick link on the Home page. Live-verified: this
   * link's behavior is inconsistent — it sometimes opens the Marketplace in
   * a NEW browser tab/window (unlike every other Home quick link this
   * framework models) and sometimes navigates in place, depending on prior
   * navigation state. Since every Page Object is bound to a single `page`
   * for the life of a test, any extra tab the click opens is closed and the
   * current tab is always routed via `navigate()` afterwards, so callers
   * reliably end up on the listing on one page/tab regardless of which way
   * the click behaved.
   */
  async openFromHome() {
    // Text-matches "Marketplace" alone; a trailing digit run is the unread-count
    // badge, which renders inline and would break an exact-text match.
    const link = this.page.getByText(/^Marketplace\d*$/).first();
    await link.waitFor({ state: 'visible', timeout: 30000 });
    const context = this.page.context();
    const pagesBefore = context.pages().length;
    await this.clickDismissingStrayModal(link);
    await this.page.waitForTimeout(2000);
    const pagesNow = context.pages();
    if (pagesNow.length > pagesBefore) {
      await pagesNow[pagesNow.length - 1].close();
    }
    await this.navigate();
  }

  /** Go directly to the Marketplace deal list. */
  async navigate() {
    await this.page.goto(Routes.MARKETPLACE);
    await this.waitForStabilization(2000);
    await this.dismissTermsIfPresent();
  }

  /**
   * First-ever visit to Marketplace for an account gates the entire deal
   * list behind a one-time "Marketplace Terms & Conditions" consent dialog
   * (full legal text + an "Agree" button). Live-verified 2026-09-04: once
   * accepted it never reappears for that account — but a freshly reset QA
   * sandbox or a new test user hits it again, and with no handling here
   * every downstream call (getDealCardCount/openDealByIndex/
   * MarketplaceDealPage.expectLoaded) silently saw an empty/blocked page
   * and hung for the full 60s timeout instead of failing fast. This is
   * what caused an 18-test cascade across 5 spec files in one run — dismiss
   * it defensively before every navigate() so that can't happen again.
   */
  private get termsAgreeButton() {
    return this.page.getByRole('button', { name: 'Agree', exact: true });
  }

  private async dismissTermsIfPresent() {
    if (await this.termsAgreeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      Logger.info('[Marketplace] One-time Terms & Conditions dialog present — accepting it');
      await this.termsAgreeButton.click();
      await this.waitForStabilization(1000);
    }
  }

  // ==================== Top bar Locators ====================

  private get searchInput() {
    return this.page.getByPlaceholder('Search by deal name or location...');
  }

  /**
   * Live-verified: this button's accessible name is dynamic — plain
   * "Filters" with none active, but "Filters (N)" once N filters are
   * applied — so an exact match on the bare word only ever matches the
   * zero-filters state.
   */
  private get filtersButton() {
    return this.page.getByRole('button', { name: /^Filters(\s\(\d+\))?$/ });
  }

  private get sortDropdown() {
    return this.page.locator('select, combobox').filter({ hasText: /Sort:/ }).first();
  }

  private viewButton(view: MarketplaceView) {
    return this.page.getByRole('button', { name: view, exact: true });
  }

  private get refreshButton() {
    return this.page.getByRole('button', { name: 'Refresh', exact: true });
  }

  private get termsAcceptButton() {
    return this.page.getByRole('button', { name: /accept/i }).first();
  }

  private get emptyStateText() {
    return this.page.getByText(/No (Marketplace )?deals? found/i).first();
  }

  // ==================== Filters panel Locators ====================

  private get filtersPanelHeading() {
    return this.page.getByRole('heading', { name: 'Filters', exact: true });
  }

  private get savedFilterDropdown() {
    return this.page.getByRole('combobox', { name: 'Saved Filter' });
  }

  private get dealStatusDropdown() {
    return this.page.getByRole('combobox', { name: 'Deal Status' });
  }

  private get dealTypeDropdown() {
    return this.page.getByRole('combobox', { name: 'Deal Type' });
  }

  private get zipCodeInput() {
    return this.page.getByPlaceholder('Zip Code');
  }

  private get radiusDropdown() {
    return this.page.getByRole('combobox', { name: 'Radius' });
  }

  private get stateDropdown() {
    return this.page.getByRole('combobox', { name: 'State' });
  }

  private get opportunityStageDropdown() {
    return this.page.getByRole('combobox', { name: 'Opportunity Stage' });
  }

  /** Only rendered when Deal Status = "My Listed Deals". */
  private get dealStageDropdown() {
    return this.page.getByRole('combobox', { name: 'Deal Stage' });
  }

  /** Only rendered when Deal Status = "My Bids". */
  private get bidStageDropdown() {
    return this.page.getByRole('combobox', { name: 'Bid Stage' });
  }

  private get lastActivityDropdown() {
    return this.page.getByRole('combobox', { name: 'Last Activity' });
  }

  private get daysInSystemDropdown() {
    return this.page.getByRole('combobox', { name: 'Days in System' });
  }

  private get daysInMarketplaceDropdown() {
    return this.page.getByRole('combobox', { name: 'Days in Marketplace' });
  }

  /** Same dynamic-label behavior as filtersButton above: "Reset" with nothing to reset, "Reset Filters" once filters are active. */
  private get resetFiltersButton() {
    return this.page.getByRole('button', { name: /^Reset( Filters)?$/ });
  }

  private get applyFiltersButton() {
    return this.page.getByRole('button', { name: 'Apply Filter', exact: true });
  }

  // ==================== Deal card Locators ====================

  /** Each deal card as a container, keyed off its own "View Deal" button. */
  private get dealCardButtons() {
    return this.page.getByRole('button', { name: 'View Deal', exact: true });
  }

  /**
   * Live-verified: the closest ancestor containing "MPD-" is `div.deal-name-action-row`
   * (just the deal ID next to the button) — a sibling of, not an ancestor of, the info
   * column that actually holds location/Est. ARV/Stage/Last Activity/Opp Age/Listing
   * Age. Requiring "Opp Age" too climbs to the real per-card container that has both.
   *
   * Live-verified (2026-08-11): that "Opp Age" heuristic only holds in Grid
   * view, where it repeats per card. In List view it's a single column
   * header, so the climb overshoots to the whole `<table>` for every row —
   * `self::tr` is checked first and, being the nearer ancestor whenever a
   * `<tr>` exists (List view), wins before the climb ever reaches that far.
   */
  private dealCard(index: number) {
    return this.dealCardButtons.nth(index).locator(
      'xpath=ancestor::*[self::tr or (.//text()[contains(., "MPD-")] and .//text()[contains(., "Opp Age")])][1]',
    );
  }

  // ==================== Top bar Actions ====================

  async searchMarketplace(query: string) {
    await this.searchInput.waitFor({ state: 'visible', timeout: 15000 });
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
    await this.waitForStabilization(2000);
  }

  async clearSearch() {
    await this.searchInput.fill('');
    await this.searchInput.press('Enter');
    await this.waitForStabilization(1500);
  }

  async selectSort(option: 'Sort: Newest' | 'Sort: Oldest') {
    await this.page.getByRole('combobox').filter({ hasText: /Sort:/ }).selectOption({ label: option });
    await this.waitForStabilization(1500);
  }

  async switchView(view: MarketplaceView) {
    await this.viewButton(view).click();
    await this.waitForStabilization(1500);
  }

  async refresh() {
    await this.refreshButton.click();
    await this.waitForStabilization(1500);
  }

  /** Accepts the Marketplace Terms & Conditions modal if it's shown (first-time visit only). */
  async acceptTermsIfPresent() {
    if (!(await this.termsAcceptButton.isVisible({ timeout: 5000 }).catch(() => false))) return false;
    await this.termsAcceptButton.click();
    await this.waitForStabilization(2000);
    return true;
  }

  // ==================== Filters panel Actions ====================

  async openFilters() {
    if (await this.filtersPanelHeading.isVisible().catch(() => false)) return;
    await this.filtersButton.click();
    await this.filtersPanelHeading.waitFor({ state: 'visible', timeout: 10000 });
  }

  async selectSavedFilter(name: string) {
    await this.openFilters();
    await this.savedFilterDropdown.selectOption({ label: name });
  }

  async selectDealStatus(status: DealStatus) {
    await this.openFilters();
    await this.dealStatusDropdown.click();
    await this.page.getByRole('option', { name: status, exact: true }).click();
  }

  async selectDealType(type: DealType) {
    await this.openFilters();
    await this.dealTypeDropdown.click();
    await this.page.getByRole('option', { name: type, exact: true }).click();
  }

  async enterZipCode(zip: string) {
    await this.openFilters();
    // Typed, not filled: the field's keystroke filter drops letters (QA 2026-10-21: "12a45" → "1245"), and fill() bypasses it.
    await this.zipCodeInput.fill('');
    await this.zipCodeInput.pressSequentially(zip);
    // The Radius enable and State mutual-exclusion reaction is debounced,
    // same as every other filter setter below — without this wait, an
    // isRadiusEnabled()/isStateEnabled() check right after fill() races it.
    await this.waitForStabilization(1500);
  }

  async selectRadius(label: string) {
    await this.openFilters();
    await this.radiusDropdown.click();
    await this.page.getByRole('option', { name: label }).click();
  }

  async selectState(state: string) {
    await this.openFilters();
    await this.stateDropdown.click();
    await this.page.getByRole('option', { name: state, exact: true }).click();
  }

  async selectOpportunityStage(stage: MarketplaceStage) {
    await this.openFilters();
    await this.opportunityStageDropdown.click();
    await this.page.getByRole('option', { name: stage, exact: true }).click();
  }

  /** Deal Stage sub-filter — only visible once Deal Status = "My Listed Deals" is selected. */
  async selectDealStage(stage: MarketplaceDealStage) {
    await this.openFilters();
    await this.dealStageDropdown.click();
    await this.page.getByRole('option', { name: stage, exact: true }).click();
  }

  /** Bid Stage sub-filter — only visible once Deal Status = "My Bids" is selected. */
  async selectBidStage(stage: MarketplaceBidStage) {
    await this.openFilters();
    await this.bidStageDropdown.click();
    await this.page.getByRole('option', { name: stage, exact: true }).click();
  }

  async isDealStageFilterVisible(): Promise<boolean> {
    await this.openFilters();
    return this.dealStageDropdown.isVisible().catch(() => false);
  }

  async isBidStageFilterVisible(): Promise<boolean> {
    await this.openFilters();
    return this.bidStageDropdown.isVisible().catch(() => false);
  }

  async selectLastActivity(label: string) {
    await this.openFilters();
    await this.lastActivityDropdown.click();
    await this.page.getByRole('option', { name: label }).click();
  }

  async selectDaysInSystem(label: string) {
    await this.openFilters();
    await this.daysInSystemDropdown.click();
    await this.page.getByRole('option', { name: label }).click();
  }

  async selectDaysInMarketplace(label: string) {
    await this.openFilters();
    await this.daysInMarketplaceDropdown.click();
    await this.page.getByRole('option', { name: label }).click();
  }

  async isRadiusEnabled(): Promise<boolean> {
    await this.openFilters();
    return this.radiusDropdown.isEnabled();
  }

  /** Live-verified: State is disabled (mutually exclusive) once a Zip Code value is present. */
  async isStateEnabled(): Promise<boolean> {
    await this.openFilters();
    return this.stateDropdown.isEnabled();
  }

  /** Reads every option label in the State dropdown (used to sanity-check the list is a real US-state set). */
  async getStateOptions(): Promise<string[]> {
    await this.openFilters();
    await this.stateDropdown.click();
    const options = this.page.getByRole('option');
    const count = await options.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) labels.push(((await options.nth(i).textContent()) || '').trim());
    await this.page.keyboard.press('Escape');
    return labels;
  }

  /** The "Limit reached..." message shown once the Zip Code input hits its 5-character cap. */
  async hasZipLimitMessage(): Promise<boolean> {
    return this.page.getByText(/limit reached/i).isVisible().catch(() => false);
  }

  async getZipCodeValue(): Promise<string> {
    return this.zipCodeInput.inputValue();
  }

  /**
   * Live-verified: the button is disabled whenever the filter panel has no
   * pending change to apply (e.g. every filter is still at its default) —
   * a real UX guard, not a bug. Clicking is skipped in that case rather
   * than waiting out a timeout for a disabled button to become clickable.
   */
  async applyFilters() {
    if (await this.applyFiltersButton.isEnabled().catch(() => false)) {
      // The button can flip back to disabled between the check and the click
      // (seen QA 2026-10-07 re-selecting a Deal Status) — that means there's
      // nothing left to apply, so don't wait out the 30s click timeout.
      await this.applyFiltersButton.click({ timeout: 5000 }).catch(() => {});
      await this.waitForStabilization(2000);
    }
  }

  async resetFilters() {
    await this.openFilters();
    await this.resetFiltersButton.click();
    await this.waitForStabilization(1500);
  }

  /** Collapses the Filters panel via its own "✕" (distinct from the inline info banner's dismiss). */
  async closeFilters() {
    const closeButton = this.page.locator('button', { hasText: '✕' }).first();
    if (await closeButton.isVisible().catch(() => false)) await closeButton.click();
  }

  /** @alias closeFilters — named to match the spreadsheet's "Hide Filter Panel" cases. */
  async hideFilterPanel() {
    await this.closeFilters();
  }

  async isFilterPanelVisible(): Promise<boolean> {
    return this.filtersPanelHeading.isVisible().catch(() => false);
  }

  // ==================== Save Filter dialog ====================

  /** "Save Filter" (Filters panel) — pick an existing saved filter to overwrite or Create New, plus the notify checkbox (live-verified QA 2026-10-09). */
  private get saveFilterDialog() {
    return this.page.getByRole('dialog').filter({ hasText: 'Select an existing saved filter to overwrite' });
  }

  private get notifyCheckbox() {
    return this.saveFilterDialog.getByRole('checkbox', { name: /Get notifications for deals that match your saved filter criteria/ });
  }

  /** Save Filter is disabled until some filter is set — callers pick one first (Cancel then saves nothing). */
  async openSaveFilterDialog() {
    await this.openFilters();
    await this.page.getByRole('button', { name: 'Save Filter', exact: true }).click();
    await this.saveFilterDialog.waitFor({ state: 'visible', timeout: 15000 });
  }

  /** Selects an existing saved filter in the dialog (the overwrite target) — its own settings load into the form. */
  async selectSavedFilterToOverwrite(name: string) {
    await this.saveFilterDialog.getByText(name, { exact: true }).click();
    await this.waitForStabilization(1000);
  }

  async isSaveFilterNotifyChecked(): Promise<boolean> {
    return this.notifyCheckbox.isChecked();
  }

  async cancelSaveFilterDialog() {
    await this.saveFilterDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await this.saveFilterDialog.waitFor({ state: 'hidden', timeout: 10000 });
  }

  /** Saved Filter dropdown entries other than "None". */
  async getSavedFilterNames(): Promise<string[]> {
    await this.openFilters();
    await this.savedFilterDropdown.click();
    await this.page.getByRole('option', { name: 'None', exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    // Page-wide options also include the Sort dropdown's two entries.
    const names = (await this.page.getByRole('option').allInnerTexts())
      .map((t) => t.trim()).filter((t) => t && t !== 'None' && !t.startsWith('Sort:'));
    await this.page.keyboard.press('Escape');
    return names;
  }

  // ==================== Deal card Actions ====================

  async getDealCardCount(): Promise<number> {
    return this.dealCardButtons.count();
  }

  /**
   * The grid renders 50 cards per page with a "Load More" button under them
   * (live-verified QA 2026-10-21), while the map plots every match. Click it
   * until it is gone so card counts cover the whole result set.
   */
  async loadAllCards() {
    const loadMore = this.page.getByRole('button', { name: 'Load More', exact: true });
    while (await loadMore.isVisible().catch(() => false)) {
      const before = await this.getDealCardCount();
      await loadMore.click();
      await expect.poll(() => this.getDealCardCount(), { timeout: 30000 }).toBeGreaterThan(before);
    }
  }

  /** Legacy alias — several existing specs call this instead of getDealCardCount(). */
  async getItemCount(): Promise<number> {
    return this.getDealCardCount();
  }

  async openDealByIndex(index: number) {
    await this.dealCardButtons.nth(index).waitFor({ state: 'visible', timeout: 30000 });
    await this.dealCardButtons.nth(index).click();
    await this.waitForStabilization(1500);
  }

  async clickFirstItem() {
    const count = await this.getDealCardCount();
    if (count === 0) return;
    await this.openDealByIndex(0);
  }

  async getCardMpdId(index: number): Promise<string> {
    const text = (await this.dealCard(index).textContent().catch(() => '')) || '';
    return text.match(/MPD-\d+/)?.[0] ?? '';
  }

  /**
   * Live-verified (2026-08-11): the location line renders in its own
   * `.prop-details` element — a prior regex assumed a ", ST 12345" shape,
   * but real cards often omit the state ("East Rutherford  07073"), so the
   * regex never matched and this always returned "".
   */
  async getCardLocation(index: number): Promise<string> {
    return ((await this.dealCard(index).locator('.prop-details').first().textContent().catch(() => '')) || '').trim();
  }

  /**
   * Live-verified: each of these labels renders as its own
   * `<span class="mp-deal-details">Label:</span> value` — the value is a
   * plain trailing text node in the *parent* element, not inside the label
   * span. Reading the label locator's own textContent only ever returns the
   * label ("Last Activity:" with no value) — these getters go one level up
   * to the parent to capture the full "Label: value" text.
   */
  async getCardEstArv(index: number): Promise<string> {
    return ((await this.dealCard(index).getByText(/Est\. ARV/).first().locator('xpath=..').textContent().catch(() => '')) || '').trim();
  }

  async getCardStage(index: number): Promise<string> {
    return ((await this.dealCard(index).getByText(/^Stage:/).first().locator('xpath=..').textContent().catch(() => '')) || '').trim();
  }

  async getCardOppAge(index: number): Promise<string> {
    return ((await this.dealCard(index).getByText(/Opp Age:/).first().locator('xpath=..').textContent().catch(() => '')) || '').trim();
  }

  async getCardListingAge(index: number): Promise<string> {
    return ((await this.dealCard(index).getByText(/Listing Age:/).first().locator('xpath=..').textContent().catch(() => '')) || '').trim();
  }

  async getCardLastActivity(index: number): Promise<string> {
    return ((await this.dealCard(index).getByText(/Last Activity:/).first().locator('xpath=..').textContent().catch(() => '')) || '').trim();
  }

  /**
   * Live-verified: the "Invited" tag sits one DOM level above `dealCard()`'s
   * own scope (which stops at the info column holding Opp Age/location/etc.)
   * — still single-card-scoped at that level, so this doesn't risk picking
   * up a neighboring card's badge.
   */
  /**
   * Live-verified 2026-09-05: the badge is `<span class="viewed-badge">
   * Invited</span>`, and it IS inside the same card `dealCard()` resolves to
   * (confirmed: page-wide "Invited" count matched the deal count exactly,
   * one per card, same MPD id in both) — but `dealCard()` is built via a
   * complex `xpath=ancestor::...` expression, and further-chaining a
   * `.getByText()` off an XPath-based locator does not pierce this app's
   * LWC shadow DOM the way Playwright's own locators normally do: scoped
   * lookups inside `dealCard()` silently found nothing, while the exact
   * same query straight off `page` worked. Falling back to a page-level,
   * order-matched query instead of scoping through `dealCard()` — safe
   * because "Invited" only ever renders once per card, in the same visual
   * order as the cards themselves.
   */
  async hasInvitedBadge(index: number): Promise<boolean> {
    return this.page.getByText('Invited', { exact: true }).nth(index).isVisible().catch(() => false);
  }

  async getCardDealTypeBadge(index: number): Promise<string | null> {
    const badge = this.dealCard(index).getByText(/^(Assignment|Buy|Sell)$/).first();
    if (!(await badge.isVisible().catch(() => false))) return null;
    return (await badge.textContent()) ?? null;
  }

  async getAllCardMpdIds(): Promise<string[]> {
    const count = await this.getDealCardCount();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) ids.push(await this.getCardMpdId(i));
    return ids;
  }

  /** Opens the card with this MPD id from the current listing; false if it isn't listed there. */
  /** Each card's text (whitespace-collapsed) in list order — compared before/after Refresh to tell whether the list auto-refreshed. */
  async getCardTexts(): Promise<string[]> {
    const count = await this.getDealCardCount();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) texts.push(((await this.dealCard(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim());
    return texts;
  }

  async openDealByMpdId(mpdId: string): Promise<boolean> {
    const index = (await this.getAllCardMpdIds()).indexOf(mpdId);
    if (index < 0) return false;
    await this.openDealByIndex(index);
    return true;
  }

  async getDealTypeLabels(): Promise<string[]> {
    const count = await this.getDealCardCount();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const badge = await this.getCardDealTypeBadge(i);
      if (badge) labels.push(badge);
    }
    return labels;
  }

  // ==================== Map View Locators ====================

  /** The embedded map — Salesforce's Lightning Maps component, itself wrapping Google Maps. */
  private get mapFrame() {
    return this.page.frameLocator('iframe[title="Map of Locations"]');
  }

  /**
   * Every deal marker/pin on the map. Live-verified: markers are real accessible
   * buttons (not canvas-drawn), aria-labelled e.g. "2 Deals | ZIP 30345" — that
   * label is also what distinguishes ZIP-grouped clustering (MV_005) and doubles
   * as the hover-preview content (MV_007), so no separate tooltip locator exists.
   */
  private get mapMarkers() {
    return this.mapFrame.getByRole('button', { name: /Deals? \| ZIP \d{5}/ });
  }

  private get currentLocationMarker() {
    return this.mapFrame.getByRole('button', { name: 'You are here' });
  }

  private mapMarkerForZip(zip: string) {
    return this.mapFrame.getByRole('button', { name: new RegExp(`Deals? \\| ZIP ${zip}`) });
  }

  /** Heading of the deal panel a marker click opens, e.g. "ZIP Code: 75240". */
  private get mapZipPanelHeading() {
    return this.page.getByText(/^ZIP Code: \d{5}$/);
  }

  /**
   * The deal ID links inside the marker's popup panel (MV_006/MV_008).
   * Live-verified: the panel renders as a plain `role="table"` with no
   * `rowheader` cells — the deal IDs are just `MPD-NNNNN` text links, so
   * matching that pattern directly is more reliable than the ARIA grid
   * roles the panel doesn't actually use.
   */
  private get mapPanelDealIds() {
    return this.page.getByText(/^MPD-\d+$/);
  }

  // ==================== Map View Actions ====================

  async isMapVisible(): Promise<boolean> {
    return this.page.locator('iframe[title="Map of Locations"]').isVisible().catch(() => false);
  }

  /**
   * The "You are here" marker is always present regardless of filters/deal
   * count, so it's a safe "the map has actually finished loading" signal —
   * unlike deal markers, whose count can legitimately be zero (MV_013).
   * Call this before reading marker count/labels right after switchView('Map')
   * to avoid racing the map's own async load.
   */
  async waitForMapReady(timeout = 20000) {
    await this.currentLocationMarker.waitFor({ state: 'visible', timeout });
    // The current-location pin renders immediately (no backend call needed);
    // deal markers come from a separate async fetch that finishes slightly
    // later, so reading marker count/labels right after the pin above still
    // occasionally races an in-flight deal query — this extra margin covers it.
    await this.waitForStabilization(2000);
  }

  async getMapMarkerCount(): Promise<number> {
    return this.mapMarkers.count();
  }

  async isCurrentLocationMarkerVisible(): Promise<boolean> {
    return this.currentLocationMarker.isVisible().catch(() => false);
  }

  async getMapMarkerLabels(): Promise<string[]> {
    const count = await this.mapMarkers.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) labels.push((await this.mapMarkers.nth(i).getAttribute('aria-label')) ?? '');
    return labels;
  }

  /**
   * The ZIP of the first marker that's actually rendered within the visible
   * map pane. Live-verified: at default zoom the map can hold markers whose
   * DOM position sits outside the visible pane (an outlier far from the rest
   * of the cluster) — same as a real user, those aren't clickable until the
   * map is zoomed/panned to bring them in (the legend's own "Zoom out to see
   * all deals" hint). Neither `click({ force: true })` (still needs a real
   * on-screen coordinate) nor a synthetic `el.click()` (fires with no
   * position, so the map's own hit-testing ignores it) can click a marker
   * that isn't genuinely visible — so tests pick from what's visible instead.
   *
   * Also excludes markers overlapping Google Maps' own bottom-left
   * attribution watermark ("Google" logo + ToS links). Live-verified
   * 2026-09-16: a marker under that watermark IS visually on-screen (passes
   * the in-viewport check above) but a click there — even with
   * `force: true`, which only skips Playwright's own interception wait and
   * still clicks whatever's topmost at that real screen coordinate — lands
   * on the watermark, not the marker, and silently does nothing.
   */
  async getFirstVisibleMapMarkerZip(): Promise<string> {
    const count = await this.mapMarkers.count();
    const viewport = this.page.viewportSize();
    const mapBox = await this.page.locator('iframe[title="Map of Locations"]').boundingBox();
    for (let i = 0; i < count; i++) {
      const marker = this.mapMarkers.nth(i);
      const box = await marker.boundingBox();
      if (!box || !viewport) continue;
      const inView = box.x >= 0 && box.y >= 0
        && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
      if (!inView) continue;
      // The map pane clips its own content: a pin can sit inside the browser
      // viewport yet outside the pane (live-verified QA 2026-10-09), where a
      // click lands on whatever is next to the map instead.
      const inPane = !mapBox || (box.x >= mapBox.x && box.y >= mapBox.y
        && box.x + box.width <= mapBox.x + mapBox.width && box.y + box.height <= mapBox.y + mapBox.height);
      if (!inPane) continue;
      if (mapBox) {
        const underWatermark = box.x <= mapBox.x + 110 && box.y + box.height >= mapBox.y + mapBox.height - 40;
        if (underWatermark) continue;
      }
      const label = await marker.getAttribute('aria-label');
      const zip = label?.match(/ZIP (\d{5})/)?.[1];
      if (zip) return zip;
    }
    return '';
  }

  /**
   * Live-verified QA 2026-10-09: the map opens centred on the franchise's
   * location (Dallas for the QA account) with a "Zoom out to see all deals"
   * hint, and no deal pin necessarily in view. Zooms out with the map's own
   * control, as a user would, until a pin is clickable; '' if none appears.
   */
  async zoomOutUntilMarkerVisible(maxSteps = 6): Promise<string> {
    await this.closeFilters();
    for (let i = 0; i <= maxSteps; i++) {
      const zip = await this.getFirstVisibleMapMarkerZip();
      if (zip) return zip;
      await this.mapFrame.getByRole('button', { name: 'Zoom out' }).click();
      await this.waitForStabilization(1500);
    }
    return '';
  }

  /**
   * Live-verified 2026-09-16: the Filters side panel's open/closed state
   * persists across navigations (it's SPA client-side state, not tied to any
   * one page load) — if a prior test left it open, its `.filter-sidebar`
   * container docks over the left edge of the map and intercepts clicks on
   * any marker that renders underneath it, timing out an otherwise-correct
   * locator. Closing it first (a no-op if already closed) avoids that.
   *
   * Also live-verified: Google Maps' own bottom-left "Google" attribution
   * watermark overlaps whichever marker happens to render near that corner
   * and intercepts the click the same way — a real user could still click
   * through/around a decorative watermark, so `force: true` bypasses
   * Playwright's actionability check for it rather than timing out on an
   * otherwise-genuinely-visible, in-viewport marker.
   */
  async clickMapMarkerForZip(zip: string) {
    await this.closeFilters();
    await this.mapMarkerForZip(zip).click({ force: true });
    await this.waitForStabilization(1500);
  }

  async isMapZipPanelVisible(): Promise<boolean> {
    return this.mapZipPanelHeading.isVisible().catch(() => false);
  }

  async getMapPanelZip(): Promise<string> {
    const text = (await this.mapZipPanelHeading.textContent().catch(() => '')) || '';
    return text.match(/\d{5}/)?.[0] ?? '';
  }

  async getMapPanelDealIds(): Promise<string[]> {
    const rows = this.mapPanelDealIds;
    const count = await rows.count();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) ids.push(((await rows.nth(i).textContent()) || '').trim());
    return ids;
  }

  // ==================== Assertions ====================

  /** Wait for the Marketplace listing to finish loading and log how many deals rendered. */
  async expectMarketplaceLoaded() {
    await this.waitForSpinner(25000);
    await this.searchInput.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    // The search input renders before the deal grid finishes its own async
    // fetch — counting immediately after it appears can race an empty grid.
    // Wait for a real card or the explicit empty-state message, whichever
    // comes first, before trusting the count.
    await Promise.race([
      this.dealCardButtons.first().waitFor({ state: 'visible', timeout: 10000 }),
      this.emptyStateText.waitFor({ state: 'visible', timeout: 10000 }),
    ]).catch(() => {});
    const count = await this.getDealCardCount();
    Logger.info(`[Marketplace] ${count} deal card(s) visible`);
  }

  async expectEmptyState(timeout = 15000) {
    await expect(this.emptyStateText).toBeVisible({ timeout });
  }
}

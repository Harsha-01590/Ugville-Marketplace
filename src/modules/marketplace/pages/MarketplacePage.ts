import { type Page, type Locator, type FrameLocator, expect } from '@playwright/test';
import { BasePage } from '@shared/pages/base/BasePage';
import { Routes } from '@enums/routes.enum';
import { Logger } from '@utils/logger';

export type DealStatus = 'Available' | 'My Direct Invites' | 'My Listed Deals' | 'My Bids' | 'Archived';
export type DealType = 'All' | 'Assignment' | 'Opportunity';
export type MarketplaceView = 'Grid' | 'List' | 'Map';
export type MarketplaceStage =
  'All Stages' | 'Lead Queue' | 'Contact' | 'Appointment' | 'Offer' | 'Contract' | 'Buy Closing';
/** Sub-filter that only renders once Deal Status = "My Listed Deals" is selected. */
export type MarketplaceDealStage =
  'All' | 'Pending Bid Review' | 'Direct' | 'Ad Council' | 'Full Network' | 'Bid Accepted';
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
  private readonly termsAgreeButton: Locator;
  private readonly searchInput: Locator;
  /**
   * Live-verified: this button's accessible name is dynamic — plain
   * "Filters" with none active, but "Filters (N)" once N filters are
   * applied — so an exact match on the bare word only ever matches the
   * zero-filters state.
   */
  private readonly filtersButton: Locator;
  private readonly sortDropdown: Locator;
  private readonly refreshButton: Locator;
  private readonly termsAcceptButton: Locator;
  private readonly emptyStateText: Locator;
  private readonly filtersPanelHeading: Locator;
  private readonly savedFilterDropdown: Locator;
  private readonly dealStatusDropdown: Locator;
  private readonly dealTypeDropdown: Locator;
  private readonly zipCodeInput: Locator;
  private readonly radiusDropdown: Locator;
  private readonly stateDropdown: Locator;
  private readonly opportunityStageDropdown: Locator;
  /** Only rendered when Deal Status = "My Listed Deals". */
  private readonly dealStageDropdown: Locator;
  /** Only rendered when Deal Status = "My Bids". */
  private readonly bidStageDropdown: Locator;
  private readonly lastActivityDropdown: Locator;
  private readonly daysInSystemDropdown: Locator;
  private readonly daysInMarketplaceDropdown: Locator;
  /**
   * Same dynamic-label behavior as filtersButton above: "Reset" with nothing to reset, "Reset Filters" once filters are
   * active.
   */
  private readonly resetFiltersButton: Locator;
  private readonly applyFiltersButton: Locator;
  /** Each deal card as a container, keyed off its own "View Deal" button. */
  private readonly dealCardButtons: Locator;
  /**
   * "Save Filter" (Filters panel) — pick an existing saved filter to overwrite or Create New, plus the notify checkbox
   * (live-verified QA 2026-10-09).
   */
  private readonly saveFilterDialog: Locator;
  private readonly notifyCheckbox: Locator;
  /** The embedded map — Salesforce's Lightning Maps component, itself wrapping Google Maps. */
  private readonly mapFrame: FrameLocator;
  /**
   * Every deal marker/pin on the map. Live-verified: markers are real accessible
   * buttons (not canvas-drawn), aria-labelled e.g. "2 Deals | ZIP 30345" — that
   * label is also what distinguishes ZIP-grouped clustering (MV_005) and doubles
   * as the hover-preview content (MV_007), so no separate tooltip locator exists.
   */
  private readonly mapMarkers: Locator;
  private readonly currentLocationMarker: Locator;
  /** Heading of the deal panel a marker click opens, e.g. "ZIP Code: 75240". */
  private readonly mapZipPanelHeading: Locator;
  /**
   * The deal ID links inside the marker's popup panel (MV_006/MV_008).
   * Live-verified: the panel renders as a plain `role="table"` with no
   * `rowheader` cells — the deal IDs are just `MPD-NNNNN` text links, so
   * matching that pattern directly is more reliable than the ARIA grid
   * roles the panel doesn't actually use.
   */
  private readonly mapPanelDealIds: Locator;
  /**
   * The "Marketplace" quick link on Home. Text-matches "Marketplace" alone; a
   * trailing digit run is the unread-count badge, which renders inline and
   * would break an exact-text match.
   */
  private readonly homeMarketplaceLink: Locator;
  /** The Sort native select (picked by option label). */
  private readonly sortSelect: Locator;
  /** Every option of whichever dropdown is open (page-wide). */
  private readonly dropdownOptions: Locator;
  /** The "Limit reached..." message shown once the Zip Code input hits its 5-character cap. */
  private readonly zipLimitMessage: Locator;
  /** The Filters panel's own "✕" (distinct from the inline info banner's dismiss). */
  private readonly filtersCloseButton: Locator;
  private readonly saveFilterButton: Locator;
  private readonly saveFilterCancelButton: Locator;
  /** "Load More" under the 50-card grid page. */
  private readonly loadMoreButton: Locator;
  /** Every "Invited" deal-card badge, in card order. */
  private readonly invitedBadges: Locator;
  /** The map's iframe element (for visibility and bounding box). */
  private readonly mapIframe: Locator;
  private readonly mapZoomOutButton: Locator;
  /** The Filters button while some filters are applied — its name then reads "Filters (N)". */
  readonly filtersButtonWithActiveFilters: Locator;
  /** The Filters button with nothing applied — plain "Filters". */
  readonly filtersButtonWithNoFilters: Locator;
  /** The "Active filters:" summary shown above the list while filters are applied. */
  readonly activeFiltersSummary: Locator;

  readonly getViewButton: (view: MarketplaceView) => Locator;
  /** An existing saved filter listed in the Save Filter dialog (the overwrite target). */
  readonly getSaveFilterOverwriteOption: (name: string) => Locator;
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
  readonly getDealCard: (index: number) => Locator;
  /** A card's location line — its own `.prop-details` element. */
  readonly getCardLocationElement: (index: number) => Locator;
  /**
   * The parent of a card's `<span class="mp-deal-details">Label:</span>` — the
   * value is a trailing text node there, not inside the label span.
   */
  readonly getCardLabelledValue: (index: number, label: RegExp) => Locator;
  readonly getCardDealTypeBadgeElement: (index: number) => Locator;
  readonly getMapMarkerForZip: (zip: string) => Locator;
  /** An option of the open dropdown, by its accessible name. */
  readonly getDropdownOption: (name: string, exact?: boolean) => Locator;

  constructor(page: Page) {
    super(page);
    // No data-testid exists in this UI (Salesforce LWR site; confirmed via live inspection of QA on 2026-10-27,
    // shadow DOM included), so every locator below falls back to role/text/CSS.
    this.termsAgreeButton = page.getByRole('button', { name: 'Agree', exact: true });
    this.searchInput = page.getByPlaceholder('Search by deal name or location...');
    this.filtersButton = page.getByRole('button', { name: /^Filters(\s\(\d+\))?$/ });
    this.sortDropdown = page.locator('select, combobox').filter({ hasText: /Sort:/ }).first();
    this.refreshButton = page.getByRole('button', { name: 'Refresh', exact: true });
    this.termsAcceptButton = page.getByRole('button', { name: /accept/i }).first();
    this.emptyStateText = page.getByText(/No (Marketplace )?deals? found/i).first();
    this.filtersPanelHeading = page.getByRole('heading', { name: 'Filters', exact: true });
    this.savedFilterDropdown = page.getByRole('combobox', { name: 'Saved Filter' });
    this.dealStatusDropdown = page.getByRole('combobox', { name: 'Deal Status' });
    this.dealTypeDropdown = page.getByRole('combobox', { name: 'Deal Type' });
    this.zipCodeInput = page.getByPlaceholder('Zip Code');
    this.radiusDropdown = page.getByRole('combobox', { name: 'Radius' });
    this.stateDropdown = page.getByRole('combobox', { name: 'State' });
    this.opportunityStageDropdown = page.getByRole('combobox', { name: 'Opportunity Stage' });
    this.dealStageDropdown = page.getByRole('combobox', { name: 'Deal Stage' });
    this.bidStageDropdown = page.getByRole('combobox', { name: 'Bid Stage' });
    this.lastActivityDropdown = page.getByRole('combobox', { name: 'Last Activity' });
    this.daysInSystemDropdown = page.getByRole('combobox', { name: 'Days in System' });
    this.daysInMarketplaceDropdown = page.getByRole('combobox', { name: 'Days in Marketplace' });
    this.resetFiltersButton = page.getByRole('button', { name: /^Reset( Filters)?$/ });
    this.applyFiltersButton = page.getByRole('button', { name: 'Apply Filter', exact: true });
    this.dealCardButtons = page.getByRole('button', { name: 'View Deal', exact: true });
    this.saveFilterDialog = page
      .getByRole('dialog')
      .filter({ hasText: 'Select an existing saved filter to overwrite' });
    // Renamed from "Get notifications for deals that match…" (live-verified QA 2026-10-28); the Email / SMS /
    // Mobile Push / UGVille Push channel checkboxes below it are separate.
    this.notifyCheckbox = this.saveFilterDialog.getByRole('checkbox', {
      name: 'Enable notifications for this saved filter',
    });
    this.mapFrame = page.frameLocator('iframe[title="Map of Locations"]');
    this.mapMarkers = this.mapFrame.getByRole('button', { name: /Deals? \| ZIP \d{5}/ });
    this.currentLocationMarker = this.mapFrame.getByRole('button', { name: 'You are here' });
    this.mapZipPanelHeading = page.getByText(/^ZIP Code: \d{5}$/);
    this.mapPanelDealIds = page.getByText(/^MPD-\d+$/);
    this.homeMarketplaceLink = page.getByText(/^Marketplace\d*$/).first();
    this.sortSelect = page.getByRole('combobox').filter({ hasText: /Sort:/ });
    this.dropdownOptions = page.getByRole('option');
    this.zipLimitMessage = page.getByText(/limit reached/i);
    this.filtersCloseButton = page.locator('button', { hasText: '✕' }).first();
    this.saveFilterButton = page.getByRole('button', { name: 'Save Filter', exact: true });
    this.saveFilterCancelButton = this.saveFilterDialog.getByRole('button', { name: 'Cancel', exact: true });
    this.loadMoreButton = page.getByRole('button', { name: 'Load More', exact: true });
    this.invitedBadges = page.getByText('Invited', { exact: true });
    this.mapIframe = page.locator('iframe[title="Map of Locations"]');
    this.mapZoomOutButton = this.mapFrame.getByRole('button', { name: 'Zoom out' });
    this.filtersButtonWithActiveFilters = page.getByRole('button', { name: /^Filters \(\d+\)$/ });
    this.filtersButtonWithNoFilters = page.getByRole('button', { name: 'Filters', exact: true });
    this.activeFiltersSummary = page.getByText('Active filters:');
    this.getViewButton = (view) => page.getByRole('button', { name: view, exact: true });
    this.getSaveFilterOverwriteOption = (name) => this.saveFilterDialog.getByText(name, { exact: true });
    this.getDealCard = (index) =>
      this.dealCardButtons
        .nth(index)
        .locator(
          'xpath=ancestor::*[self::tr or (.//text()[contains(., "MPD-")] and .//text()[contains(., "Opp Age")])][1]',
        );
    this.getCardLocationElement = (index) => this.getDealCard(index).locator('.prop-details').first();
    this.getCardLabelledValue = (index, label) => this.getDealCard(index).getByText(label).first().locator('xpath=..');
    this.getCardDealTypeBadgeElement = (index) =>
      this.getDealCard(index)
        .getByText(/^(Assignment|Buy|Sell)$/)
        .first();
    this.getMapMarkerForZip = (zip) => this.mapFrame.getByRole('button', { name: new RegExp(`Deals? \\| ZIP ${zip}`) });
    this.getDropdownOption = (name, exact = true) => page.getByRole('option', { name, exact });
  }

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
  async openFromHome(): Promise<void> {
    const link = this.homeMarketplaceLink;
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
  async navigate(): Promise<void> {
    await this.page.goto(Routes.MARKETPLACE);
    await this.waitForStabilization(2000);
    await this.dismissTermsIfPresent();
  }

  async dismissTermsIfPresent(): Promise<void> {
    if (await this.termsAgreeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      Logger.info('[Marketplace] One-time Terms & Conditions dialog present — accepting it');
      await this.termsAgreeButton.click();
      await this.waitForStabilization(1000);
    }
  }

  async searchMarketplace(query: string): Promise<void> {
    await this.searchInput.waitFor({ state: 'visible', timeout: 15000 });
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
    await this.waitForStabilization(2000);
  }

  async clearSearch(): Promise<void> {
    await this.searchInput.fill('');
    await this.searchInput.press('Enter');
    await this.waitForStabilization(1500);
  }

  async selectSort(option: 'Sort: Newest' | 'Sort: Oldest'): Promise<void> {
    await this.sortSelect.selectOption({ label: option });
    await this.waitForStabilization(1500);
  }

  async switchView(view: MarketplaceView): Promise<void> {
    await this.getViewButton(view).click();
    await this.waitForStabilization(1500);
  }

  async refresh(): Promise<void> {
    await this.refreshButton.click();
    await this.waitForStabilization(1500);
  }

  /** Accepts the Marketplace Terms & Conditions modal if it's shown (first-time visit only). */
  async acceptTermsIfPresent(): Promise<boolean> {
    if (!(await this.termsAcceptButton.isVisible({ timeout: 5000 }).catch(() => false))) return false;
    await this.termsAcceptButton.click();
    await this.waitForStabilization(2000);
    return true;
  }

  async openFilters(): Promise<void> {
    if (await this.filtersPanelHeading.isVisible().catch(() => false)) return;
    await this.filtersButton.click();
    await this.filtersPanelHeading.waitFor({ state: 'visible', timeout: 10000 });
  }

  async selectSavedFilter(name: string): Promise<void> {
    await this.openFilters();
    await this.savedFilterDropdown.selectOption({ label: name });
  }

  async selectDealStatus(status: DealStatus): Promise<void> {
    await this.openFilters();
    await this.dealStatusDropdown.click();
    await this.getDropdownOption(status).click();
  }

  async selectDealType(type: DealType): Promise<void> {
    await this.openFilters();
    await this.dealTypeDropdown.click();
    await this.getDropdownOption(type).click();
  }

  async enterZipCode(zip: string): Promise<void> {
    await this.openFilters();
    // Typed, not filled: the field's keystroke filter drops letters (QA 2026-10-21: "12a45" → "1245"), and fill()
    // bypasses it.
    await this.zipCodeInput.fill('');
    await this.zipCodeInput.pressSequentially(zip);
    // The Radius enable and State mutual-exclusion reaction is debounced,
    // same as every other filter setter below — without this wait, an
    // isRadiusEnabled()/isStateEnabled() check right after fill() races it.
    await this.waitForStabilization(1500);
  }

  async selectRadius(label: string): Promise<void> {
    await this.openFilters();
    await this.radiusDropdown.click();
    await this.getDropdownOption(label, false).click();
  }

  async selectState(state: string): Promise<void> {
    await this.openFilters();
    await this.stateDropdown.click();
    await this.getDropdownOption(state).click();
  }

  async selectOpportunityStage(stage: MarketplaceStage): Promise<void> {
    await this.openFilters();
    await this.opportunityStageDropdown.click();
    await this.getDropdownOption(stage).click();
  }

  /** Deal Stage sub-filter — only visible once Deal Status = "My Listed Deals" is selected. */
  async selectDealStage(stage: MarketplaceDealStage): Promise<void> {
    await this.openFilters();
    await this.dealStageDropdown.click();
    await this.getDropdownOption(stage).click();
  }

  /** Bid Stage sub-filter — only visible once Deal Status = "My Bids" is selected. */
  async selectBidStage(stage: MarketplaceBidStage): Promise<void> {
    await this.openFilters();
    await this.bidStageDropdown.click();
    await this.getDropdownOption(stage).click();
  }

  async isDealStageFilterVisible(): Promise<boolean> {
    await this.openFilters();
    return this.dealStageDropdown.isVisible().catch(() => false);
  }

  async isBidStageFilterVisible(): Promise<boolean> {
    await this.openFilters();
    return this.bidStageDropdown.isVisible().catch(() => false);
  }

  async selectLastActivity(label: string): Promise<void> {
    await this.openFilters();
    await this.lastActivityDropdown.click();
    await this.getDropdownOption(label, false).click();
  }

  async selectDaysInSystem(label: string): Promise<void> {
    await this.openFilters();
    await this.daysInSystemDropdown.click();
    await this.getDropdownOption(label, false).click();
  }

  async selectDaysInMarketplace(label: string): Promise<void> {
    await this.openFilters();
    await this.daysInMarketplaceDropdown.click();
    await this.getDropdownOption(label, false).click();
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
    const options = this.dropdownOptions;
    const count = await options.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) labels.push(((await options.nth(i).textContent()) || '').trim());
    await this.page.keyboard.press('Escape');
    return labels;
  }

  /** Reads every option label of the Radius dropdown (opened, then closed with Escape). */
  async getRadiusOptions(): Promise<string[]> {
    await this.radiusDropdown.click();
    const labels = (await this.dropdownOptions.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return labels;
  }

  /** The "Limit reached..." message shown once the Zip Code input hits its 5-character cap. */
  async hasZipLimitMessage(): Promise<boolean> {
    return this.zipLimitMessage.isVisible().catch(() => false);
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
  async applyFilters(): Promise<void> {
    if (await this.applyFiltersButton.isEnabled().catch(() => false)) {
      // The button can flip back to disabled between the check and the click
      // (seen QA 2026-10-07 re-selecting a Deal Status) — that means there's
      // nothing left to apply, so don't wait out the 30s click timeout.
      await this.applyFiltersButton.click({ timeout: 5000 }).catch(() => {});
      await this.waitForStabilization(2000);
    }
  }

  async resetFilters(): Promise<void> {
    await this.openFilters();
    await this.resetFiltersButton.click();
    await this.waitForStabilization(1500);
  }

  /** Collapses the Filters panel via its own "✕" (distinct from the inline info banner's dismiss). */
  async closeFilters(): Promise<void> {
    if (await this.filtersCloseButton.isVisible().catch(() => false)) await this.filtersCloseButton.click();
  }

  /** @alias closeFilters — named to match the spreadsheet's "Hide Filter Panel" cases. */
  async hideFilterPanel(): Promise<void> {
    await this.closeFilters();
  }

  async isFilterPanelVisible(): Promise<boolean> {
    return this.filtersPanelHeading.isVisible().catch(() => false);
  }

  /** Save Filter is disabled until some filter is set — callers pick one first (Cancel then saves nothing). */
  async openSaveFilterDialog(): Promise<void> {
    await this.openFilters();
    await this.saveFilterButton.click();
    await this.saveFilterDialog.waitFor({ state: 'visible', timeout: 15000 });
  }

  /** Selects an existing saved filter in the dialog (the overwrite target) — its own settings load into the form. */
  async selectSavedFilterToOverwrite(name: string): Promise<void> {
    await this.getSaveFilterOverwriteOption(name).click();
    await this.waitForStabilization(1000);
  }

  async isSaveFilterNotifyChecked(): Promise<boolean> {
    return this.notifyCheckbox.isChecked();
  }

  async cancelSaveFilterDialog(): Promise<void> {
    await this.saveFilterCancelButton.click();
    await this.saveFilterDialog.waitFor({ state: 'hidden', timeout: 10000 });
  }

  /** Saved Filter dropdown entries other than "None". */
  async getSavedFilterNames(): Promise<string[]> {
    await this.openFilters();
    await this.savedFilterDropdown.click();
    await this.getDropdownOption('None').waitFor({ state: 'visible', timeout: 10000 });
    // Page-wide options also include the Sort dropdown's two entries.
    const names = (await this.dropdownOptions.allInnerTexts())
      .map((t) => t.trim())
      .filter((t) => t && t !== 'None' && !t.startsWith('Sort:'));
    await this.page.keyboard.press('Escape');
    return names;
  }

  async getDealCardCount(): Promise<number> {
    return this.dealCardButtons.count();
  }

  /**
   * The grid renders 50 cards per page with a "Load More" button under them
   * (live-verified QA 2026-10-21), while the map plots every match. Click it
   * until it is gone so card counts cover the whole result set.
   */
  async loadAllCards(): Promise<void> {
    const loadMore = this.loadMoreButton;
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

  async openDealByIndex(index: number): Promise<void> {
    await this.dealCardButtons.nth(index).waitFor({ state: 'visible', timeout: 30000 });
    await this.dealCardButtons.nth(index).click();
    await this.waitForStabilization(1500);
  }

  async clickFirstItem(): Promise<void> {
    const count = await this.getDealCardCount();
    if (count === 0) return;
    await this.openDealByIndex(0);
  }

  async getCardMpdId(index: number): Promise<string> {
    const text =
      (await this.getDealCard(index)
        .textContent()
        .catch(() => '')) || '';
    return text.match(/MPD-\d+/)?.[0] ?? '';
  }

  /**
   * Live-verified (2026-08-11): the location line renders in its own
   * `.prop-details` element — a prior regex assumed a ", ST 12345" shape,
   * but real cards often omit the state ("East Rutherford  07073"), so the
   * regex never matched and this always returned "".
   */
  async getCardLocation(index: number): Promise<string> {
    return (
      (await this.getCardLocationElement(index)
        .textContent()
        .catch(() => '')) || ''
    ).trim();
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
    return (
      (await this.getCardLabelledValue(index, /Est\. ARV/)
        .textContent()
        .catch(() => '')) || ''
    ).trim();
  }

  async getCardStage(index: number): Promise<string> {
    return (
      (await this.getCardLabelledValue(index, /^Stage:/)
        .textContent()
        .catch(() => '')) || ''
    ).trim();
  }

  async getCardOppAge(index: number): Promise<string> {
    return (
      (await this.getCardLabelledValue(index, /Opp Age:/)
        .textContent()
        .catch(() => '')) || ''
    ).trim();
  }

  async getCardListingAge(index: number): Promise<string> {
    return (
      (await this.getCardLabelledValue(index, /Listing Age:/)
        .textContent()
        .catch(() => '')) || ''
    ).trim();
  }

  async getCardLastActivity(index: number): Promise<string> {
    return (
      (await this.getCardLabelledValue(index, /Last Activity:/)
        .textContent()
        .catch(() => '')) || ''
    ).trim();
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
    return this.invitedBadges
      .nth(index)
      .isVisible()
      .catch(() => false);
  }

  async getCardDealTypeBadge(index: number): Promise<string | null> {
    const badge = this.getCardDealTypeBadgeElement(index);
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
  /**
   * Each card's text (whitespace-collapsed) in list order — compared before/after Refresh to tell whether the list
   * auto-refreshed.
   */
  async getCardTexts(): Promise<string[]> {
    const count = await this.getDealCardCount();
    const texts: string[] = [];
    for (let i = 0; i < count; i++)
      texts.push(
        (
          (await this.getDealCard(i)
            .innerText()
            .catch(() => '')) || ''
        )
          .replace(/\s+/g, ' ')
          .trim(),
      );
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

  async isMapVisible(): Promise<boolean> {
    return this.mapIframe.isVisible().catch(() => false);
  }

  /**
   * The "You are here" marker is always present regardless of filters/deal
   * count, so it's a safe "the map has actually finished loading" signal —
   * unlike deal markers, whose count can legitimately be zero (MV_013).
   * Call this before reading marker count/labels right after switchView('Map')
   * to avoid racing the map's own async load.
   */
  async waitForMapReady(timeout = 20000): Promise<void> {
    await this.currentLocationMarker.waitFor({ state: 'visible', timeout });
    // The current-location pin renders immediately (no backend call needed);
    // deal markers come from a separate async fetch that finishes slightly
    // later, so reading marker count/labels right after the pin above still
    // occasionally races an in-flight deal query — this extra margin covers it.
    await this.waitForStabilization(2000);
  }

  async getMapMarkerCount(): Promise<number> {
    return (await this.getMapMarkerLabels()).length;
  }

  async isCurrentLocationMarkerVisible(): Promise<boolean> {
    return this.currentLocationMarker.isVisible().catch(() => false);
  }

  /**
   * One label per pin. Seen QA 2026-10-28: after filtering, the map can render a second copy of a pin
   * (same "N Deals | ZIP" label, tabindex 0 instead of -1); a label names one ZIP, so repeats are dropped.
   */
  async getMapMarkerLabels(): Promise<string[]> {
    const count = await this.mapMarkers.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) labels.push((await this.mapMarkers.nth(i).getAttribute('aria-label')) ?? '');
    return [...new Set(labels)];
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
    const mapBox = await this.mapIframe.boundingBox();
    for (let i = 0; i < count; i++) {
      const marker = this.mapMarkers.nth(i);
      const box = await marker.boundingBox();
      if (!box || !viewport) continue;
      const inView =
        box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
      if (!inView) continue;
      // The map pane clips its own content: a pin can sit inside the browser
      // viewport yet outside the pane (live-verified QA 2026-10-09), where a
      // click lands on whatever is next to the map instead.
      const inPane =
        !mapBox ||
        (box.x >= mapBox.x &&
          box.y >= mapBox.y &&
          box.x + box.width <= mapBox.x + mapBox.width &&
          box.y + box.height <= mapBox.y + mapBox.height);
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
      await this.mapZoomOutButton.click();
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
  async clickMapMarkerForZip(zip: string): Promise<void> {
    await this.closeFilters();
    // .first(): the pin can be rendered twice (see getMapMarkerLabels).
    await this.getMapMarkerForZip(zip).first().click({ force: true });
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

  /** Wait for the Marketplace listing to finish loading and log how many deals rendered. */
  async expectMarketplaceLoaded(): Promise<void> {
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

  async expectEmptyState(timeout = 15000): Promise<void> {
    await expect(this.emptyStateText).toBeVisible({ timeout });
  }

  /** The 5-digit zip in card `index`'s location ('' when it shows none). */
  async getCardZip(index: number): Promise<string> {
    return (await this.getCardLocation(index)).match(/\b\d{5}\b/)?.[0] ?? '';
  }

  /** Every card's Location | Stage | Listing Age, for checking a filter really narrowed every result. */
  async getCardSummaries(): Promise<string[]> {
    const count = await this.getDealCardCount();
    const summaries: string[] = [];
    for (let i = 0; i < count; i++) {
      summaries.push(
        [await this.getCardLocation(i), await this.getCardStage(i), await this.getCardListingAge(i)].join(' | '),
      );
    }
    return summaries;
  }

  /** Last Activity / Opp Age / Listing Age as read from every card. */
  async getCardDayFields(): Promise<Array<{ lastActivity: string; oppAge: string; listingAge: string }>> {
    const count = await this.getDealCardCount();
    const fields: Array<{ lastActivity: string; oppAge: string; listingAge: string }> = [];
    for (let i = 0; i < count; i++) {
      fields.push({
        lastActivity: await this.getCardLastActivity(i),
        oppAge: await this.getCardOppAge(i),
        listingAge: await this.getCardListingAge(i),
      });
    }
    return fields;
  }

  /** Card `index`'s value-bearing fields: Est. ARV, Last Activity, Opp Age, Listing Age. */
  async getCardValueFields(index: number): Promise<string[]> {
    return [
      await this.getCardEstArv(index),
      await this.getCardLastActivity(index),
      await this.getCardOppAge(index),
      await this.getCardListingAge(index),
    ];
  }

  /** Card `index`'s core fields by name: MPD id, Est. ARV, Stage, Opp Age, Listing Age, Last Activity. */
  async getCardCoreFields(index: number): Promise<Record<string, string>> {
    return {
      mpdId: await this.getCardMpdId(index),
      estArv: await this.getCardEstArv(index),
      stage: await this.getCardStage(index),
      oppAge: await this.getCardOppAge(index),
      listingAge: await this.getCardListingAge(index),
      lastActivity: await this.getCardLastActivity(index),
    };
  }

  /** The MPD ids of the first `max` cards. */
  async getFirstCardMpdIds(max: number): Promise<string[]> {
    return (await this.getAllCardMpdIds()).slice(0, max);
  }

  /**
   * Returns the current list's card count; when the applied filters leave it empty, reloads the
   * unfiltered list first and returns that count instead.
   */
  async showUnfilteredIfEmpty(): Promise<number> {
    const filtered = await this.getDealCardCount();
    if (filtered > 0) return filtered;
    await this.navigate();
    await this.expectMarketplaceLoaded();
    return this.getDealCardCount();
  }

  /** Every card's MPD id, sorted — for comparing two views' contents regardless of order. */
  async getSortedCardMpdIds(): Promise<string[]> {
    return (await this.getAllCardMpdIds()).sort();
  }

  /**
   * Which of the saved filters `names` have "Get notifications" ticked, sorted. Reads each through the
   * Save Filter dialog (a Deal Type is picked first to enable Save Filter); the dialog is cancelled.
   */
  async getNotifiedSavedFilters(names: string[]): Promise<string[]> {
    const notified: string[] = [];
    await this.selectDealType('Assignment');
    await this.openSaveFilterDialog();
    for (const name of names) {
      await this.selectSavedFilterToOverwrite(name);
      if (await this.isSaveFilterNotifyChecked()) notified.push(name);
    }
    await this.cancelSaveFilterDialog();
    return notified.sort();
  }

  /** True when saved filter `name` has "Get notifications" ticked (read via the Save Filter dialog, then cancelled). */
  async isSavedFilterNotified(name: string): Promise<boolean> {
    return (await this.getNotifiedSavedFilters([name])).length === 1;
  }

  /** Position of `mpdId`'s card in the list (-1 when it isn't listed). */
  async getCardIndex(mpdId: string): Promise<number> {
    return (await this.getAllCardMpdIds()).indexOf(mpdId);
  }

  /** True when `mpdId`'s card is on the list as it currently stands. */
  async isCardListed(mpdId: string): Promise<boolean> {
    return (await this.getAllCardMpdIds()).includes(mpdId);
  }

  /** `mpdId`'s card text as the list stands ('(not listed)' when absent). */
  async getCardTextFor(mpdId: string): Promise<string> {
    return (await this.getCardTexts()).find((t) => t.includes(mpdId)) ?? '(not listed)';
  }

  /** `mpdId`'s card text as the list stands, then again after the list's own Refresh button. */
  async getCardBeforeAndAfterRefresh(mpdId: string): Promise<{ before: string; after: string }> {
    const before = await this.getCardTextFor(mpdId);
    await this.refresh();
    await this.expectMarketplaceLoaded();
    return { before, after: await this.getCardTextFor(mpdId) };
  }

  /** Navigates the list to `status` (filters reset first) without opening a deal. */
  async showList(status: Exclude<DealStatus, 'Archived'>): Promise<void> {
    await this.navigate();
    await this.resetFilters();
    await this.expectMarketplaceLoaded();
    if (status !== 'Available') {
      await this.selectDealStatus(status);
      await this.applyFilters();
      await this.expectMarketplaceLoaded();
    }
  }

  /**
   * The State filter's own options: getStateOptions() reads every role=option on the page, which also
   * picks up the Sort dropdown's two options and the "All" entry.
   */
  async getStateFilterOptions(): Promise<string[]> {
    return (await this.getStateOptions()).filter((o) => !o.startsWith('Sort:') && o !== 'All');
  }

  /** The Radius options that are distances ("10 miles", …), narrowest first. */
  async getRadiusMileOptions(): Promise<string[]> {
    return (await this.getRadiusOptions())
      .filter((t) => /miles/i.test(t))
      .sort((x, y) => radiusMiles(x) - radiusMiles(y));
  }

  /** Applies Radius `label`, confirms it is the applied radius and returns the resulting deal count. */
  async applyRadiusAndCount(label: string): Promise<number> {
    await this.selectRadius(label);
    await this.waitForStabilization(1500);
    await this.applyFilters();
    await this.expectMarketplaceLoaded();
    await expect(this.getMessageText(`Radius: ${radiusMiles(label)} miles`), `${label} is the applied radius`).toBeVisible();
    const count = await this.getDealCardCount();
    Logger.log(`Radius ${label} → ${count} deal(s)`);
    return count;
  }

  /** Asserts the page is on the Marketplace route (/market-place/). */
  async expectOnMarketplaceRoute(): Promise<void> {
    await expect(this.page).toHaveURL((url) => url.pathname.includes(Routes.MARKETPLACE));
  }

  /** True when the Zip Code filter rejected `typed`: a zip error shows, or the value never made it into the field. */
  async isZipRejected(typed: string): Promise<boolean> {
    const value = await this.getZipCodeValue();
    const error = await this.isMessageShown(/valid (5-digit )?zip|zip code (must|should)|only numeric|numbers only/i);
    Logger.log(`"${typed}" → field "${value}", error shown = ${error}, ${await this.getDealCardCount()} deal(s)`);
    return error || value !== typed;
  }

  /** Total deals across every map pin ("2 Deals | ZIP 30345" → 2) — what the grid's card count should equal. */
  async getMapDealTotal(): Promise<number> {
    return (await this.getMapMarkerLabels()).reduce((sum, label) => sum + markerDealCount(label), 0);
  }

  /** The deal count on `zip`'s map pin (0 when there is no such pin). */
  async getMapMarkerDealCount(zip: string): Promise<number> {
    const label = (await this.getMapMarkerLabels()).find((l) => l.includes(`ZIP ${zip}`));
    return label ? markerDealCount(label) : 0;
  }

  /** True when a map pin is labelled with `zip`. */
  async hasMapMarkerForZip(zip: string): Promise<boolean> {
    return (await this.getMapMarkerLabels()).some((l) => l.includes(`ZIP ${zip}`));
  }
}

/** USPS codes of the 50 states (DC is tolerated in the State filter but not required). */
export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND',
  'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

/** State filter options that aren't a US state (DC allowed). */
export function invalidStateOptions(options: string[]): string[] {
  return options.filter((o) => !US_STATES.includes(o) && o !== 'DC');
}

/** US states missing from the State filter options. */
export function missingStates(options: string[]): string[] {
  return US_STATES.filter((st) => !options.includes(st));
}

/** Entries that appear more than once. */
export function duplicateEntries(values: string[]): string[] {
  return values.filter((v, i) => values.indexOf(v) !== i);
}

/** The miles in a Radius option ("25 miles" → 25). */
export function radiusMiles(label: string): number {
  return Number(label.match(/\d+/)?.[0] ?? 0);
}

/** The narrowest and widest of Radius options already sorted narrowest first. */
export function narrowestAndWidest(options: string[]): { narrowest: string; widest: string } {
  return { narrowest: options[0], widest: options[options.length - 1] };
}

/** The deal count on a map pin label ("2 Deals | ZIP 30345" → 2). */
export function markerDealCount(label: string): number {
  return Number(label.match(/^(\d+)/)?.[1] ?? 0);
}

/** Each card summary's Listing Age in days, skipping cards that show none. */
export function listingAgesFrom(summaries: string[]): number[] {
  return summaries
    .map((c) => Number(c.match(/Listing Age:\s*(\d+)/)?.[1] ?? NaN))
    .filter((n) => !Number.isNaN(n));
}

/** The first `max` card indexes of a list of `count` cards ([0, 1, …]). */
export function firstCardIndexes(count: number, max: number): number[] {
  return Array.from({ length: Math.min(count, max) }, (_, i) => i);
}

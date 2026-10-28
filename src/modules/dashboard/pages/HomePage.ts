import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from '@shared/pages/base/BasePage';
import { Routes } from '@enums/routes.enum';
import { Logger } from '@utils/logger';
import { MarketplacePage } from '@modules/marketplace/pages/MarketplacePage';

/**
 * Page Object for the Ugville Home / Dashboard Page.
 * URL: /ugville/ (after login)
 *
 * This is the landing page after `LoginPage` and the hub every other module
 * launches from: the Seller Stage Wizard (New Seller Opportunity), Vendor Hub,
 * Community/Learning quick links, and the Tasks/Notifications/My People panels
 * (see their own Page Objects — `TasksPanelComponent`, `NotificationsPanelComponent`,
 * `MyPeoplePage`) all start from a control exposed here.
 *
 * Handles:
 * - Step 2: On the Home Page click on New Seller Opportunity
 *           and click on New/Existing Contact.
 * - Navigation to Vendor Hub via utility bar.
 */
type StageTileName = 'Lead Queue' | 'Contact' | 'Appointment' | 'Offer' | 'Contract';
type SellerOppsTabName = 'Opportunities' | 'Tasks' | 'Calendar';

export class HomePage extends BasePage {
  /** Vendor Hub span element in the utility bar. */
  readonly vendorHubLink: Locator;
  /** Opens the New Seller Opportunity dropdown (New Contact / Existing Contact). */
  private readonly newSellerOpportunityButton: Locator;
  /** "New Contact" option in the New Seller Opportunity dropdown. */
  private readonly newContactOption: Locator;
  /** "Existing Contact" option in the New Seller Opportunity dropdown. */
  private readonly existingContactOption: Locator;
  /**
   * Seller Opportunities card. Scoped by the Calendar tab button rather than the
   * "Seller Opportunities" heading — the heading's article ancestor also wraps the
   * New Seller Opportunities table, whose "Contact" column header would otherwise
   * collide with the Contact stage tile lookup.
   */
  private readonly sellerOpportunitiesCard: Locator;
  readonly newSellerOpportunitiesTable: Locator;
  /** Body rows of the New Seller Opportunities table (newest first). */
  readonly newSellerOpportunityRows: Locator;
  /**
   * First Contact link in the New Seller Opportunities table's "Contact" column
   * (`/ugville/crm/contact/{id}/detail`). There is no standalone Contacts list
   * page in the app — `/ugville/crm/contacts` 404s — so this table is the real,
   * always-populated way to reach an existing Contact Detail record.
   */
  readonly firstOpportunityContactLink: Locator;
  /**
   * First Project link in the New Seller Opportunities table's "Property" column
   * (`/ugville/crm/project/{id}/detail`). Same story as `firstOpportunityContactLink` —
   * there is no standalone Projects list page (`/ugville/crm/projects` 404s), so this
   * table is the real way to reach an existing Project Detail record.
   */
  readonly firstOpportunityProjectLink: Locator;
  readonly corporateBlogsHeading: Locator;
  /** Entry point into the My People panel (see `MyPeoplePage`). */
  readonly myPeopleLink: Locator;
  /**
   * Live-verified (2026-09-05): the "HVA Update" video widget renders as a
   * same-origin `<iframe src="https://.../ugsupport/apex/scormanywhere__SCORM_Player?...">`
   * — NOT a plain `<video>` tag or a youtube/vimeo embed, so a locator
   * matching on those substrings never finds it. Only one iframe exists on
   * Home, so `frameLocator('iframe')` unambiguously targets it.
   */
  readonly hvaVideoPlayer: Locator;
  /** "HVA Roadmap" link in the persistent left navigation menu. */
  readonly hvaRoadmapLink: Locator;
  /** First banner in the rotating vendor-detail ad carousel. */
  readonly vendorBannerCarousel: Locator;
  /** Convention / summer summit registration banner (links out to hvaregistration.com). */
  readonly conventionBanner: Locator;
  /** Task cards rendered inside the "All Open" tasks card on Home (see `TasksPanelComponent` for the full panel). */
  readonly tasksList: Locator;
  /**
   * The "Marketplace" quick-link's merged text carries a trailing
   * unread-count digit run when new deals exist since last login (same
   * inline-badge shape as `MarketplacePage.openFromHome()`'s own
   * `/^Marketplace\d*$/` match — reused here rather than a fresh locator).
   */
  readonly marketplaceQuickLink: Locator;

  /**
   * One of the 5 stage tiles rendered inside the Seller Opportunities card (Lead
   * Queue/Contact/Appointment/Offer/Contract).
   */
  readonly getStageTile: (name: StageTileName) => Locator;
  /** The Opportunities/Tasks/Calendar tab switcher inside the Seller Opportunities card. */
  readonly getSellerOppsTabButton: (name: SellerOppsTabName) => Locator;
  /**
   * Quick-link paragraphs rendered under the New Seller Opportunities card (Franchise Referrals, System & Standards,
   * Ethics Hotline, Vendor Hub, Podcast, HVA Give Back).
   */
  readonly getQuickLink: (name: string) => Locator;

  constructor(page: Page) {
    super(page);
    // No data-testid exists in this UI (Salesforce LWR site; confirmed via live inspection of QA on 2026-10-27,
    // shadow DOM included), so every locator below falls back to role/text/CSS.
    this.vendorHubLink = page.locator('span.slds-utility-bar__text', { hasText: 'Vendor Hub' });
    this.newSellerOpportunityButton = page.getByRole('button', { name: 'New Seller Opportunity' });
    this.newContactOption = page.getByText('New Contact', { exact: true });
    this.existingContactOption = page.getByText('Existing Contact', { exact: true });
    this.sellerOpportunitiesCard = page
      .locator('article')
      .filter({ has: page.getByRole('button', { name: 'Calendar', exact: true }) });
    this.newSellerOpportunitiesTable = page
      .locator('table')
      .filter({ has: page.getByRole('columnheader', { name: 'Lead Queue Date' }) });
    this.newSellerOpportunityRows = this.newSellerOpportunitiesTable.locator('tbody tr');
    this.firstOpportunityContactLink = this.newSellerOpportunitiesTable.locator('a[href*="/crm/contact/"]').first();
    this.firstOpportunityProjectLink = this.newSellerOpportunitiesTable.locator('a[href*="/crm/project/"]').first();
    this.corporateBlogsHeading = page.getByRole('heading', { name: 'Corporate Blogs' });
    this.myPeopleLink = page.getByText('My People', { exact: true });
    this.hvaVideoPlayer = page.frameLocator('iframe').getByRole('region', { name: 'Video Player' });
    this.hvaRoadmapLink = page.getByRole('navigation', { name: 'UGVille' }).getByText('HVA Roadmap', { exact: true });
    this.vendorBannerCarousel = page.locator('a[href*="vendor-detail"]').first();
    this.conventionBanner = page.locator('a[href*="hvaregistration.com"]').first();
    this.tasksList = page.locator('article').filter({ hasText: 'All Open' }).locator('li');
    this.marketplaceQuickLink = page.getByText(/^Marketplace\d*$/).first();
    this.getStageTile = (name) => this.sellerOpportunitiesCard.getByText(name, { exact: true }).locator('..');
    this.getSellerOppsTabButton = (name) => this.sellerOpportunitiesCard.getByRole('button', { name, exact: true });
    this.getQuickLink = (name) => page.getByText(name, { exact: true }).first();
  }

  async getStageTileCount(name: StageTileName): Promise<number> {
    const text = (await this.getStageTile(name).textContent()) || '';
    const match = text.replace(name, '').match(/\d+/);
    return match ? parseInt(match[0], 10) : NaN;
  }

  async clickStageTile(name: StageTileName): Promise<void> {
    await this.getStageTile(name).click();
  }

  async clickSellerOppsTab(name: SellerOppsTabName): Promise<void> {
    await this.getSellerOppsTabButton(name).click();
  }

  /**
   * The trailing digit run on the Marketplace quick-link, or 0 if no badge is shown (no new deals since last login).
   */
  async getMarketplaceBadgeCount(): Promise<number> {
    const text = ((await this.marketplaceQuickLink.textContent().catch(() => '')) || '').trim();
    const match = text.match(/^Marketplace(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Go straight to the Home dashboard (assumes already logged in).
   * Also clears two stray overlays confirmed (live, via manual browser
   * session) to appear shortly after a Home load — after the settle wait
   * below, not immediately on goto, which is why the pre-test
   * `_dismissStrayModal` fixture alone isn't enough for these two:
   *   1. Salesforce's periodic "Reminders" modal — its `slds-modal`
   *      overlay blocks pointer events for the *entire* page, not just
   *      Home (confirmed: Playwright's own click-retry log reports
   *      "subtree intercepts pointer events" when it's open).
   *   2. The "Recently Visited Leads" sidebar, which covers Home's own
   *      widgets (My People, Tasks, etc.) but doesn't affect other pages.
   */
  async navigate(): Promise<void> {
    await this.page.goto(Routes.HOME);
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(3000);
    await this.closeStrayModalIfOpen();
    await this.closeRecentlyVisitedLeadsIfOpen();
  }

  /** Opens Home and waits for its Salesforce spinner to clear — the clean starting point for most tests. */
  async openAndSettle(): Promise<void> {
    await this.navigate();
    await this.waitForSpinner();
  }

  /** Clicks the Marketplace quick link and returns the Marketplace opened in the new tab it spawns. */
  async openMarketplaceQuickLinkInNewTab(): Promise<MarketplacePage> {
    const newTab = this.page.context().waitForEvent('page', { timeout: 15000 });
    await this.marketplaceQuickLink.click();
    return new MarketplacePage(await newTab);
  }

  /** Returns to Home after a test without failing it if the navigation is interrupted. */
  async returnHomeQuietly(): Promise<void> {
    await this.page.goto(Routes.HOME).catch(() => {});
  }

  /** Go to Vendor Hub via the utility bar link (see `VendorHomePage`). */
  async clickVendorHub(): Promise<void> {
    await this.vendorHubLink.click();
  }

  /** Open the New Seller Opportunity dropdown. */
  async clickNewSellerOpportunity(): Promise<void> {
    await this.waitForSpinner(30000);
    await this.newSellerOpportunityButton.click({ force: true });
  }

  /** Pick "New Contact" from an already-open New Seller Opportunity dropdown. */
  async selectNewContact(): Promise<void> {
    await this.newContactOption.waitFor({ state: 'visible', timeout: 30000 });
    await this.newContactOption.click({ force: true });
  }

  /** Pick "Existing Contact" from an already-open New Seller Opportunity dropdown. */
  async selectExistingContact(): Promise<void> {
    await this.existingContactOption.waitFor({ state: 'visible', timeout: 30000 });
    await this.existingContactOption.click({ force: true });
  }

  /** Full Step 2: Click New Seller Opportunity → New Contact */
  async startNewOpportunityWithNewContact(): Promise<void> {
    await this.closeRecentlyVisitedLeadsIfOpen();
    await this.waitForSpinner(30000);

    let opened = false;
    for (let i = 0; i < 5; i++) {
      await this.newSellerOpportunityButton.click({ force: true });
      await this.page.waitForTimeout(2000);
      if (await this.newContactOption.isVisible()) {
        opened = true;
        break;
      }
      Logger.warn(`Retrying New Seller Opportunity click (attempt ${i + 1})...`);
    }

    if (!opened) {
      await this.newSellerOpportunityButton.click().catch(() => {});
      await this.page.waitForTimeout(2000);
      if (await this.newContactOption.isVisible()) {
        opened = true;
      }
    }

    if (!opened) {
      throw new Error('Failed to open New Seller Opportunity dropdown (New Contact option did not appear).');
    }

    await this.newContactOption.click({ force: true });
  }

  /** Full Step 2: Click New Seller Opportunity → Existing Contact */
  async startNewOpportunityWithExistingContact(): Promise<void> {
    await this.waitForSpinner(30000);

    let opened = false;
    for (let i = 0; i < 5; i++) {
      await this.newSellerOpportunityButton.click({ force: true });
      await this.page.waitForTimeout(2000);
      if (await this.existingContactOption.isVisible()) {
        opened = true;
        break;
      }
      Logger.warn(`Retrying New Seller Opportunity click (attempt ${i + 1})...`);
    }

    if (!opened) {
      await this.newSellerOpportunityButton.click().catch(() => {});
      await this.page.waitForTimeout(2000);
      if (await this.existingContactOption.isVisible()) {
        opened = true;
      }
    }

    if (!opened) {
      throw new Error('Failed to open New Seller Opportunity dropdown (Existing Contact option did not appear).');
    }

    await this.existingContactOption.click({ force: true });
  }

  /**
   * Open the first Contact from the New Seller Opportunities table's "Contact" column. Returns the contact's link text.
   */
  async openFirstOpportunityContact(): Promise<string> {
    const link = this.firstOpportunityContactLink;
    await link.waitFor({ state: 'visible', timeout: 30000 });
    const title = (await link.innerText()).trim();
    await link.click();
    return title;
  }

  /**
   * Open the first Project from the New Seller Opportunities table's "Property" column. Returns the project's link
   * text.
   */
  async openFirstOpportunityProject(): Promise<string> {
    const link = this.firstOpportunityProjectLink;
    await link.waitFor({ state: 'visible', timeout: 30000 });
    const title = (await link.innerText()).trim();
    await link.click();
    return title;
  }

  async expectDashboardVisible(): Promise<void> {
    await this.waitForSpinner(30000);
    await expect(this.newSellerOpportunityButton).toBeVisible({ timeout: 30000 });
  }
}

import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../../../shared/pages/base/BasePage';
import { Routes } from '../../../enums/routes.enum';

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
export class HomePage extends BasePage {
    readonly vendorHubLink: Locator;

    constructor(page: Page) {
        super(page);
        // Locator for the Vendor Hub span element in the utility bar
        this.vendorHubLink = page.locator('span.slds-utility-bar__text', { hasText: 'Vendor Hub' });
    }

    // ==================== Locators ====================

    /** Opens the New Seller Opportunity dropdown (New Contact / Existing Contact). */
    private get newSellerOpportunityButton() {
        return this.page.getByRole('button', { name: 'New Seller Opportunity' });
    }

    /** "New Contact" option in the New Seller Opportunity dropdown. */
    private get newContactOption() {
        return this.page.getByText('New Contact', { exact: true });
    }

    /** "Existing Contact" option in the New Seller Opportunity dropdown. */
    private get existingContactOption() {
        return this.page.getByText('Existing Contact', { exact: true });
    }

    private get sellerOpportunitiesCard() {
        // Scoped by the Calendar tab button rather than the "Seller Opportunities" heading —
        // the heading's article ancestor also wraps the New Seller Opportunities table, whose
        // "Contact" column header would otherwise collide with the Contact stage tile lookup.
        return this.page
            .locator('article')
            .filter({ has: this.page.getByRole('button', { name: 'Calendar', exact: true }) });
    }

    /** One of the 5 stage tiles rendered inside the Seller Opportunities card (Lead Queue/Contact/Appointment/Offer/Contract). */
    stageTile(name: 'Lead Queue' | 'Contact' | 'Appointment' | 'Offer' | 'Contract') {
        return this.sellerOpportunitiesCard.getByText(name, { exact: true }).locator('..');
    }

    async getStageTileCount(name: 'Lead Queue' | 'Contact' | 'Appointment' | 'Offer' | 'Contract'): Promise<number> {
        const text = (await this.stageTile(name).textContent()) || '';
        const match = text.replace(name, '').match(/\d+/);
        return match ? parseInt(match[0], 10) : NaN;
    }

    async clickStageTile(name: 'Lead Queue' | 'Contact' | 'Appointment' | 'Offer' | 'Contract') {
        await this.stageTile(name).click();
    }

    /** The Opportunities/Tasks/Calendar tab switcher inside the Seller Opportunities card. */
    sellerOppsTabButton(name: 'Opportunities' | 'Tasks' | 'Calendar') {
        return this.sellerOpportunitiesCard.getByRole('button', { name, exact: true });
    }

    async clickSellerOppsTab(name: 'Opportunities' | 'Tasks' | 'Calendar') {
        await this.sellerOppsTabButton(name).click();
    }

    get newSellerOpportunitiesTable() {
        return this.page.locator('table').filter({ has: this.page.getByRole('columnheader', { name: 'Lead Queue Date' }) });
    }

    /**
     * First Contact link in the New Seller Opportunities table's "Contact" column
     * (`/ugville/crm/contact/{id}/detail`). There is no standalone Contacts list
     * page in the app — `/ugville/crm/contacts` 404s — so this table is the real,
     * always-populated way to reach an existing Contact Detail record.
     */
    get firstOpportunityContactLink() {
        return this.newSellerOpportunitiesTable.locator('a[href*="/crm/contact/"]').first();
    }

    /**
     * First Project link in the New Seller Opportunities table's "Property" column
     * (`/ugville/crm/project/{id}/detail`). Same story as `firstOpportunityContactLink` —
     * there is no standalone Projects list page (`/ugville/crm/projects` 404s), so this
     * table is the real way to reach an existing Project Detail record.
     */
    get firstOpportunityProjectLink() {
        return this.newSellerOpportunitiesTable.locator('a[href*="/crm/project/"]').first();
    }

    get corporateBlogsHeading() {
        return this.page.getByRole('heading', { name: 'Corporate Blogs' });
    }

    /** Quick-link paragraphs rendered under the New Seller Opportunities card (Franchise Referrals, System & Standards, Ethics Hotline, Vendor Hub, Podcast, HVA Give Back). */
    quickLink(name: string) {
        return this.page.getByText(name, { exact: true }).first();
    }

    /** Entry point into the My People panel (see `MyPeoplePage`). */
    get myPeopleLink() {
        return this.page.getByText('My People', { exact: true });
    }

    /**
     * Live-verified (2026-09-05): the "HVA Update" video widget renders as a
     * same-origin `<iframe src="https://.../ugsupport/apex/scormanywhere__SCORM_Player?...">`
     * — NOT a plain `<video>` tag or a youtube/vimeo embed, so a locator
     * matching on those substrings never finds it. Only one iframe exists on
     * Home, so `frameLocator('iframe')` unambiguously targets it.
     */
    get hvaVideoPlayer() {
        return this.page.frameLocator('iframe').getByRole('region', { name: 'Video Player' });
    }

    /** "HVA Roadmap" link in the persistent left navigation menu. */
    get hvaRoadmapLink() {
        return this.page.getByRole('navigation', { name: 'UGVille' }).getByText('HVA Roadmap', { exact: true });
    }

    /** First banner in the rotating vendor-detail ad carousel. */
    get vendorBannerCarousel() {
        return this.page.locator('a[href*="vendor-detail"]').first();
    }

    /** Convention / summer summit registration banner (links out to hvaregistration.com). */
    get conventionBanner() {
        return this.page.locator('a[href*="hvaregistration.com"]').first();
    }

    /** Task cards rendered inside the "All Open" tasks card on Home (see `TasksPanelComponent` for the full panel). */
    get tasksList() {
        return this.page.locator('article').filter({ hasText: 'All Open' }).locator('li');
    }

    /**
     * The "Marketplace" quick-link's merged text carries a trailing
     * unread-count digit run when new deals exist since last login (same
     * inline-badge shape as `MarketplacePage.openFromHome()`'s own
     * `/^Marketplace\d*$/` match — reused here rather than a fresh locator).
     */
    get marketplaceQuickLink() {
        return this.page.getByText(/^Marketplace\d*$/).first();
    }

    // ==================== Actions ====================

    /** The trailing digit run on the Marketplace quick-link, or 0 if no badge is shown (no new deals since last login). */
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
    async navigate() {
        await this.page.goto(Routes.HOME);
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(3000);
        await this.closeStrayModalIfOpen();
        await this.closeRecentlyVisitedLeadsIfOpen();
    }

    /** Go to Vendor Hub via the utility bar link (see `VendorHomePage`). */
    async clickVendorHub() {
        await this.vendorHubLink.click();
    }

    /** Open the New Seller Opportunity dropdown. */
    async clickNewSellerOpportunity() {
        await this.waitForSpinner(30000);
        await this.newSellerOpportunityButton.click({ force: true });
    }

    /** Pick "New Contact" from an already-open New Seller Opportunity dropdown. */
    async selectNewContact() {
        await this.newContactOption.waitFor({ state: 'visible', timeout: 30000 });
        await this.newContactOption.click({ force: true });
    }

    /** Pick "Existing Contact" from an already-open New Seller Opportunity dropdown. */
    async selectExistingContact() {
        await this.existingContactOption.waitFor({ state: 'visible', timeout: 30000 });
        await this.existingContactOption.click({ force: true });
    }

    /** Full Step 2: Click New Seller Opportunity → New Contact */
    async startNewOpportunityWithNewContact() {
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
            console.log(`Retrying New Seller Opportunity click (attempt ${i + 1})...`);
        }

        if (!opened) {
            await this.newSellerOpportunityButton.click().catch(() => {});
            await this.page.waitForTimeout(2000);
            if (await this.newContactOption.isVisible()) {
                opened = true;
            }
        }

        if (!opened) {
            throw new Error(
                'Failed to open New Seller Opportunity dropdown (New Contact option did not appear).',
            );
        }

        await this.newContactOption.click({ force: true });
    }

    /** Full Step 2: Click New Seller Opportunity → Existing Contact */
    async startNewOpportunityWithExistingContact() {
        await this.waitForSpinner(30000);

        let opened = false;
        for (let i = 0; i < 5; i++) {
            await this.newSellerOpportunityButton.click({ force: true });
            await this.page.waitForTimeout(2000);
            if (await this.existingContactOption.isVisible()) {
                opened = true;
                break;
            }
            console.log(`Retrying New Seller Opportunity click (attempt ${i + 1})...`);
        }

        if (!opened) {
            await this.newSellerOpportunityButton.click().catch(() => {});
            await this.page.waitForTimeout(2000);
            if (await this.existingContactOption.isVisible()) {
                opened = true;
            }
        }

        if (!opened) {
            throw new Error(
                'Failed to open New Seller Opportunity dropdown (Existing Contact option did not appear).',
            );
        }

        await this.existingContactOption.click({ force: true });
    }

    /** Open the first Contact from the New Seller Opportunities table's "Contact" column. Returns the contact's link text. */
    async openFirstOpportunityContact(): Promise<string> {
        const link = this.firstOpportunityContactLink;
        await link.waitFor({ state: 'visible', timeout: 30000 });
        const title = (await link.innerText()).trim();
        await link.click();
        return title;
    }

    /** Open the first Project from the New Seller Opportunities table's "Property" column. Returns the project's link text. */
    async openFirstOpportunityProject(): Promise<string> {
        const link = this.firstOpportunityProjectLink;
        await link.waitFor({ state: 'visible', timeout: 30000 });
        const title = (await link.innerText()).trim();
        await link.click();
        return title;
    }

    // ==================== Assertions ====================

    async expectDashboardVisible() {
        await this.waitForSpinner(30000);
        await expect(this.newSellerOpportunityButton).toBeVisible({ timeout: 30000 });
    }
}

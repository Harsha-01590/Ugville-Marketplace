import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../../../shared/pages/base/BasePage';
import { Routes } from '../../../enums/routes.enum';
import { MarketplaceListingComponent } from '../components/MarketplaceListingComponent';
import type { HomePage } from '../../dashboard';

type RelatedTab = 'Notes' | 'DA Fee' | 'Fee' | 'Campaigns' | 'Stage Files';

/**
 * Page Object for the Seller Lead record view (an Opportunity in one of the
 * Seller stages: Lead Queue, Contact, Appointment, Offer, Contract, Buy
 * Closing, Closed Lost). Covers record-level chrome — header, Details,
 * Related tabs, Timeline, quick actions, Stage History — that sits above
 * the Stage Wizard form itself (see `LeadQueuePage` for the wizard).
 */
export class SellerLeadPage extends BasePage {
  readonly marketplaceListing: MarketplaceListingComponent;

  constructor(page: Page) {
    super(page);
    this.marketplaceListing = new MarketplaceListingComponent(page);
  }

  // ==================== Navigation ====================

  async navigateById(opportunityId: string) {
    await this.page.goto(`${Routes.OPPORTUNITY_DETAIL}/${opportunityId}`);
    await this.page.waitForLoadState('domcontentloaded');
    await this.waitForSpinner(25000);
  }

  // ==================== Header Locators ====================

  /**
   * Live-verified: "Account"/"Lead Contact" are plain `<span>` labels with
   * no aria-label/aria-labelledby tying them to the adjacent link — the
   * link's own accessible name is the account/contact's name, not
   * "Account"/"Contact" (same finding as `BuyerLeadPage.accountLink`).
   * Anchoring on the label's sibling link instead.
   */
  private get accountLink() {
    return this.page.getByText('Account', { exact: true }).locator('..').getByRole('link').first();
  }

  private get contactLink() {
    return this.page.getByText('Lead Contact', { exact: true }).locator('..').getByRole('link').first();
  }

  private get propertyAddressLink() {
    return this.page.locator('a[href*="/crm/project"]').first();
  }

  // ==================== Quick Action Locators ====================

  /**
   * Live-verified (2026-08-11): the quick actions (Log a Call/New Task/New
   * Appointment/Email) are tabs in an overflowing tablist inside the
   * record's "Activities" section — not standalone buttons, and not
   * visible at all until the "Activities" record-level tab is active (see
   * `ensureActivitiesTabActive()`). "New Appointment"/"Email" overflow into
   * a "More Tabs" menu once the visible strip is full.
   */
  private get activitiesRecordTab() {
    return this.page.getByRole('tab', { name: 'Activities', exact: true });
  }

  /**
   * Live-verified (2026-08-11): "Notes"/"DA Fee"/"Fee"/"Campaigns"/"Files"
   * sections only render once this "Related" record-level tab is active —
   * same not-rendered-until-selected pattern as `activitiesRecordTab`.
   */
  private get relatedRecordTab() {
    return this.page.getByRole('tab', { name: 'Related', exact: true });
  }

  private get moreTabsButton() {
    return this.page.getByRole('button', { name: 'More Tabs' });
  }

  private get logACallButton() {
    return this.page.getByRole('tab', { name: 'Log a Call', exact: true });
  }

  private get newTaskButton() {
    return this.page.getByRole('tab', { name: 'New Task', exact: true });
  }

  private get emailMenuItem() {
    return this.page.getByRole('menuitem', { name: 'Email', exact: true });
  }

  /**
   * Live-verified (2026-08-11): the Activities quick-action strip only ever
   * renders "Log a Call"/"New Task"/"New Appointment"/"Email" (plus
   * "Select Your Campaign"/"Team" as accordion buttons) — there is no
   * standalone "Call" action anywhere on a Seller Lead. The Mobile field's
   * `tel:` link is the closest equivalent, but it starts a native dial-out
   * rather than opening a compose UI, so it is not a substitute. Kept only
   * to detect that absence gracefully (see `clickCallQuickAction`) rather
   * than hard-fail.
   */
  private get callQuickAction() {
    return this.page.getByRole('button', { name: /^Call$/i }).first();
  }

  /**
   * Live-verified (2026-08-11): same finding as `callQuickAction` — there is
   * no standalone "SMS" action on a Seller Lead's Activities strip. Kept
   * only to detect that absence gracefully (see `clickSmsQuickAction`).
   */
  private get smsQuickAction() {
    return this.page.getByRole('button', { name: /^SMS$/i }).first();
  }

  /**
   * Live-verified (2026-08-11): the "*Subject" text is a plain sibling
   * element, not a `<label for>`/`aria-label` associated with the input —
   * `getByLabel` can never match it. Of the (usually 3) "*Subject" markers
   * in the DOM — one per quick-action composer — only the currently-open
   * one is actually visible, so anchoring on that plus its adjacent input
   * reliably targets whichever composer (Log a Call/New Task/Email) is
   * open, without needing to know which one that is.
   */
  private get subjectInput() {
    return this.page
      .getByText('*Subject', { exact: true })
      .locator('visible=true')
      .locator('xpath=following-sibling::*[1]//input | following-sibling::input[1]');
  }

  /**
   * Scoped to the same composer container as the visible Subject field —
   * an unscoped `getByRole('button', { name: /^(Save|Send)$/i })` can also
   * match the unrelated Stage Wizard panel's own "Save" button.
   */
  private get saveOrSendButton() {
    return this.page
      .getByText('*Subject', { exact: true })
      .locator('visible=true')
      .locator('xpath=ancestor::*[.//button[normalize-space(text())="Save" or normalize-space(text())="Send"]][1]')
      .getByRole('button', { name: /^(Save|Send)$/i });
  }

  // ==================== Quick Action Actions ====================

  async ensureActivitiesTabActive() {
    const selected = await this.activitiesRecordTab.getAttribute('aria-selected').catch(() => null);
    if (selected !== 'true') {
      await this.activitiesRecordTab.click();
      await this.page.waitForTimeout(1000);
    }
  }

  async ensureRelatedTabActive() {
    const selected = await this.relatedRecordTab.getAttribute('aria-selected').catch(() => null);
    if (selected !== 'true') {
      await this.relatedRecordTab.click();
      await this.page.waitForTimeout(1000);
    }
  }

  // ==================== Related / Timeline Locators ====================

  /**
   * Live-verified (2026-08-11): "Notes"/"DA Fee"/"Fee"/"Campaigns"/"Stage
   * Files" are not tabs — the Related tabpanel renders them as stacked
   * `<article>` sections (plain headings), all present at once once
   * "Related" itself is active. "Stage Files" in particular renders under a
   * "Files" heading, not "Stage Files". `getByRole('tab', ...)` never
   * matches any of them, so this now targets the section heading instead.
   */
  relatedTab(name: RelatedTab) {
    const headingText = name === 'Stage Files' ? 'Files' : name;
    return this.page.getByRole('heading', { name: headingText, exact: true });
  }

  private get timelineItems() {
    return this.page.locator('[class*="timeline" i] [class*="activity" i], [class*="timeline" i] li');
  }

  private get stageHistorySection() {
    return this.page.getByText(/Stage History/i).first();
  }

  /**
   * Live-verified (2026-08-11): "Assigned To" labels exist in the DOM but
   * stay permanently hidden (0×0, never rendered) — there is no usable
   * "Assigned To" field anywhere on a Seller Lead record. The closest
   * visible concept, "Coordinator", is a read-only display label here (no
   * associated input/combobox to fill). The actual editable Coordinator
   * lookup lives on the Lead Queue Stage Wizard (see
   * `TeamAssignmentComponent`/`LeadQueuePage`), not on this record's
   * chrome. Kept only to detect that absence gracefully (see
   * `assignFranchiseCoordinator`) rather than hard-fail — presence alone
   * isn't enough here, callers must check visibility.
   */
  private get assignedToLookup() {
    return this.page.getByLabel(/Assigned To/i).first();
  }

  private get uploadDocumentButton() {
    return this.page.getByRole('button', { name: /Upload Document/i }).first();
  }

  // ==================== Record Header Action Locators ====================

  /**
   * Live-verified (2026-09-05): the record header's action group renders
   * exactly three buttons — "Update Owner", "Chatter", "Change To
   * Assignment" — each opening the same shared modal `dialog` (only one is
   * ever open at a time), so its fields are scoped to `recordActionDialog`
   * to avoid colliding with the header's own same-named "Update Owner"
   * button once the dialog is open.
   */
  private get updateOwnerButton() {
    return this.page.getByRole('button', { name: 'Update Owner', exact: true });
  }

  private get changeToAssignmentButton() {
    return this.page.getByRole('button', { name: 'Change To Assignment', exact: true });
  }

  private get recordActionDialog() {
    return this.page.getByRole('dialog');
  }

  private get dialogCancelButton() {
    return this.recordActionDialog.getByRole('button', { name: 'Cancel and close' });
  }

  private get ownerCombobox() {
    return this.recordActionDialog.getByRole('combobox', { name: 'Opportunity Owner' });
  }

  private get sendNotificationCheckbox() {
    return this.recordActionDialog.getByRole('checkbox', { name: 'Send Notification Email?' });
  }

  private get updateOwnerSubmitButton() {
    return this.recordActionDialog.getByRole('button', { name: 'Update Owner', exact: true });
  }

  private get assignmentSoldToCombobox() {
    return this.recordActionDialog.getByRole('combobox', { name: 'Contact Assignment Sold To' });
  }

  private get assignmentValueInput() {
    return this.recordActionDialog.getByRole('spinbutton', { name: 'Assignment Value' });
  }

  private get changeToAssignmentSaveButton() {
    return this.recordActionDialog.getByRole('button', { name: 'Save', exact: true });
  }

  // ==================== Marketplace listing Locators ====================

  /**
   * Live-verified: this control's rendered text toggles between "List in
   * Marketplace" (not yet listed) and a "View..." form once a deal exists —
   * but its accessible name stays the stale "View Marketplace items" even in
   * the not-yet-listed state, so callers must read the rendered text, not
   * the accessible name, to tell the two states apart.
   */
  private get marketplaceCtaButton() {
    return this.page.getByText(/^(List in Marketplace|View (in )?Marketplace( items)?)$/).first();
  }

  /**
   * Live-verified 2026-09-05: a fixture Opportunity can drift out of the
   * Stage Wizard's supported record types entirely — the page renders
   * "There is no wizard available for this record type." instead of any
   * wizard content, and the Marketplace CTA (which lives inside that
   * wizard) never appears at all. Distinct from the already-documented
   * "already listed → View in Marketplace" outcome; this is the record no
   * longer being wizard-eligible at all, not merely already listed.
   */
  private get noWizardMessage() {
    return this.page.getByText('There is no wizard available for this record type.');
  }

  async hasNoWizardForRecordType(): Promise<boolean> {
    return this.noWizardMessage.isVisible().catch(() => false);
  }

  // ==================== Actions ====================

  /**
   * Follows the header's "Account" hyperlink to the CRM Account record.
   * Live-verified (UAT 2026-09-08): the label is a `<span>Account</span>`
   * whose sibling link points at `/ugville/crm/account/{id}/detail`.
   *
   * No `force` — the Salesforce header re-renders a few times while it
   * hydrates, and a forced click could fire on a still-covered / stale
   * anchor and never navigate (the old failure: URL stayed on the
   * Opportunity). Letting Playwright wait for actionability, then waiting on
   * the account route, makes the navigation deterministic.
   */
  async clickAccountLink() {
    await this.accountLink.click();
    await this.page.waitForURL(/\/crm\/account\//, { timeout: 20000 });
    await this.waitForStabilization();
  }

  async clickContactLink() {
    await this.contactLink.click({ force: true });
    await this.waitForStabilization();
  }

  async clickPropertyAddressLink() {
    await this.propertyAddressLink.click({ force: true });
    await this.waitForStabilization();
  }

  async clickLogACall(subject: string) {
    await this.ensureActivitiesTabActive();
    await this.logACallButton.click();
    await this.page.waitForTimeout(1000);
    if (subject) await this.subjectInput.fill(subject);
    await this.saveOrSendButton.click({ force: true });
    await this.waitForStabilization();
  }

  async clickSendEmail(subject: string) {
    await this.ensureActivitiesTabActive();
    // "Email" overflows the visible tab strip into a "More Tabs" menu.
    await this.moreTabsButton.click();
    await this.page.waitForTimeout(500);
    await this.emailMenuItem.click();
    await this.page.waitForTimeout(1000);
    if (subject) await this.subjectInput.fill(subject);
    await this.saveOrSendButton.click({ force: true });
    await this.waitForStabilization();
  }

  async clickNewTask(subject: string) {
    await this.ensureActivitiesTabActive();
    await this.newTaskButton.click();
    await this.page.waitForTimeout(1000);
    if (subject) await this.subjectInput.fill(subject);
    await this.saveOrSendButton.click({ force: true });
    await this.waitForStabilization();
  }

  /** No standalone "Call" quick action exists on a Seller Lead (live-verified 2026-08-11) — logs the absence instead of hard-failing. */
  async clickCallQuickAction() {
    const available = (await this.callQuickAction.count()) > 0;
    console.log(`  [SellerLead] Call quick action available = ${available}`);
    if (!available) return;
    await this.callQuickAction.click({ force: true });
    await this.page.waitForTimeout(1000);
  }

  /** No standalone "SMS" quick action exists on a Seller Lead (live-verified 2026-08-11) — logs the absence instead of hard-failing. */
  async clickSmsQuickAction() {
    const available = (await this.smsQuickAction.count()) > 0;
    console.log(`  [SellerLead] SMS quick action available = ${available}`);
    if (!available) return;
    await this.smsQuickAction.click({ force: true });
    await this.page.waitForTimeout(1000);
  }

  /** Related sub-sections are stacked headings, not tabs — all render at once once "Related" itself is active, so this just ensures that and scrolls the target section into view. */
  async openRelatedTab(name: RelatedTab) {
    await this.ensureRelatedTabActive();
    await this.relatedTab(name).scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(1000);
  }

  async getTimelineCount(): Promise<number> {
    return this.timelineItems.count();
  }

  async openTimelineItem(index = 0) {
    await this.timelineItems.nth(index).click({ force: true });
    await this.page.waitForTimeout(1500);
  }

  async getTimelineTimestamps(): Promise<string[]> {
    const texts = await this.timelineItems.allInnerTexts();
    return texts
      .map((t) => t.match(/\b\d{1,2}:\d{2}\s?(AM|PM)\b/i)?.[0])
      .filter((t): t is string => !!t);
  }

  /** No usable "Assigned To" field exists on a Seller Lead's own chrome (live-verified 2026-08-11) — logs the absence instead of hard-failing. */
  async assignFranchiseCoordinator(name: string) {
    const available = await this.assignedToLookup.isVisible().catch(() => false);
    console.log(`  [SellerLead] Assigned To field available = ${available} (coordinator "${name}" not applicable if absent)`);
    if (!available) return;
    await this.searchLookupAndPickFirst(this.assignedToLookup, name);
  }

  async uploadStageFile(filePath: string) {
    await this.uploadDocumentButton.click({ force: true });
    await this.page.locator('input[type="file"]').first().setInputFiles(filePath);
    await this.page.waitForTimeout(2000);
  }

  async hasStageFileUpload(): Promise<boolean> {
    return this.uploadDocumentButton.isVisible().catch(() => false);
  }

  // ==================== Record Header Action Actions ====================

  async openUpdateOwnerDialog() {
    await this.updateOwnerButton.click();
    await this.ownerCombobox.waitFor({ state: 'visible', timeout: 15000 });
  }

  async openChangeToAssignmentDialog() {
    await this.changeToAssignmentButton.click();
    await this.assignmentSoldToCombobox.waitFor({ state: 'visible', timeout: 15000 });
  }

  async cancelRecordActionDialog() {
    await this.dialogCancelButton.click();
    await this.recordActionDialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  /**
   * Live-verified (2026-09-05): the "Opportunity Owner" combobox is a real
   * `<input>` (an editable lookup) — its current value lives in the input's
   * `value` property, not its text content, so `textContent()` always
   * returns "". Falls back to `textContent()` for safety in case a future
   * build renders it as a read-only combobox instead.
   */
  async getUpdateOwnerCurrentValue(): Promise<string> {
    const value = await this.ownerCombobox.inputValue().catch(() => '');
    if (value) return value.trim();
    return ((await this.ownerCombobox.textContent()) || '').trim();
  }

  async isSendNotificationCheckboxVisible(): Promise<boolean> {
    return this.sendNotificationCheckbox.isVisible().catch(() => false);
  }

  async isUpdateOwnerFormVisible(): Promise<boolean> {
    const owner = await this.ownerCombobox.isVisible().catch(() => false);
    const notify = await this.sendNotificationCheckbox.isVisible().catch(() => false);
    return owner && notify;
  }

  /** Re-submits the current owner unchanged — exercises the save path without reassigning a shared QA record to a different owner. */
  async submitUpdateOwnerUnchanged() {
    await this.updateOwnerSubmitButton.click();
    await this.recordActionDialog.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  }

  async isChangeToAssignmentFormVisible(): Promise<boolean> {
    const soldTo = await this.assignmentSoldToCombobox.isVisible().catch(() => false);
    const value = await this.assignmentValueInput.isVisible().catch(() => false);
    const save = await this.changeToAssignmentSaveButton.isVisible().catch(() => false);
    return soldTo && value && save;
  }

  // ==================== Marketplace listing Actions ====================

  /** The exact rendered CTA text — "List in Marketplace" means this Opportunity has no deal yet. */
  async getMarketplaceCtaText(): Promise<string> {
    return ((await this.marketplaceCtaButton.textContent().catch(() => '')) || '').trim();
  }

  async hasMarketplaceCta(): Promise<boolean> {
    return this.marketplaceCtaButton.isVisible().catch(() => false);
  }

  /** True only while this Opportunity is still un-listed — the only state the "New Deal" flow (`this.marketplaceListing`) can be (re-)opened from. */
  async isListInMarketplaceCtaShown(): Promise<boolean> {
    return (await this.getMarketplaceCtaText()) === 'List in Marketplace';
  }

  /**
   * Walks Home's "New Seller Opportunities" table (newest first) and stays on
   * the first Opportunity that still shows "List in Marketplace" and is not a
   * corp deal (Lead Type "Corporate" — shown as a "CORP" badge once listed). Returns its name, or
   * '' if none qualify. Rows whose contact is a manual "Test DI" record are
   * left alone. Every real listing consumes one Opportunity for good.
   * ponytail: only the table's ~10 newest rows are scanned; widen to the
   * Opportunity Tracker if the pool runs dry.
   */
  async openFirstListableFromHome(home: HomePage): Promise<string> {
    await home.navigate();
    const rows = home.newSellerOpportunitiesTable.locator('tbody tr');
    await rows.first().waitFor({ state: 'visible', timeout: 60000 });
    const candidates = await rows.evaluateAll((trs) =>
      trs.map((tr) => ({
        name: ((tr as HTMLElement).innerText || '').split('\t')[0].trim(),
        text: (tr as HTMLElement).innerText || '',
        href: (tr.querySelector('a') as HTMLAnchorElement | null)?.href ?? '',
      })),
    );
    for (const { name, text, href } of candidates) {
      if (!href || /test ?di/i.test(text)) continue;
      await this.page.goto(href);
      await this.page.waitForLoadState('domcontentloaded');
      await this.marketplaceCtaButton.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
      if (!(await this.isListInMarketplaceCtaShown())) continue;
      if (await this.isCorpDeal()) {
        console.log(`  [SellerLead] skipping corp deal "${name}"`);
        continue;
      }
      await this.page.getByRole('tab', { name: 'Stage Wizard', exact: true }).first().click();
      await this.marketplaceCtaButton.waitFor({ state: 'visible', timeout: 20000 });
      console.log(`  [SellerLead] picked listable seller op "${name}"`);
      return name;
    }
    return '';
  }

  /**
   * Creates a brand-new seller Opportunity from Home (New Seller Opportunity →
   * New Contact) for `accountName` with random contact data and a random
   * house-numbered address, and stays on its record page. Returns its name.
   * Ported from the standalone root `test.tsx` script. Ad Council defaults to
   * "Converse" (the one test.tsx uses). `opts.arv` fills the wizard's Pricing
   * "ARV" field; `opts.skipProperty` ticks "Skip adding property now" instead
   * of picking an address (the op then has no Property Address).
   */
  async createFromHome(
    home: HomePage, accountName: string, adCouncil = 'Converse',
    opts: { arv?: string; skipProperty?: boolean } = {},
  ): Promise<string> {
    await home.navigate();
    await home.startNewOpportunityWithNewContact();
    // Scoped to the wizard: the page has a second "Next" (table pagination).
    const wizard = this.page.getByRole('dialog', { name: 'New Seller Opportunity' });

    const account = wizard.getByRole('combobox', { name: 'Account Name' });
    await account.click();
    await account.pressSequentially(accountName.split(/[\s,]/)[0], { delay: 80 });
    await wizard.getByRole('option', { name: accountName }).click();
    await wizard.getByRole('combobox', { name: 'Ad Council' }).click();
    await wizard.getByRole('option', { name: adCouncil }).click();

    const n = Math.floor(1000 + Math.random() * 9000);
    const phone = `${6 + Math.floor(Math.random() * 4)}${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}0000`;
    const names = [
      'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Drew', 'Quinn', 'Avery',
      'Cameron', 'Reese', 'Skyler', 'Rowan', 'Finley', 'Emerson', 'Hayden', 'Peyton', 'Dakota', 'Charlie',
      'Sawyer', 'Blake', 'Harper', 'Kendall', 'Marley', 'Parker', 'Sydney', 'Elliot', 'River', 'Shawn',
      'James', 'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Mia',
      'Lucas', 'Grace', 'Henry', 'Chloe', 'Owen', 'Nora', 'Isaac', 'Hazel', 'Miles', 'Audrey',
    ];
    const firstName = `${names[Math.floor(Math.random() * names.length)]}${n}`;
    await wizard.getByRole('textbox', { name: 'First Name' }).fill(firstName);
    await wizard.getByRole('textbox', { name: 'Phone' }).fill(phone);
    await wizard.getByRole('textbox', { name: 'Email' }).fill(`${firstName.toLowerCase()}@gmail.com.invalid`);
    await wizard.getByRole('textbox', { name: 'Mobile' }).fill(phone);

    if (opts.skipProperty) {
      // The property step only renders after Next; Skip lives on that step.
      await wizard.getByRole('button', { name: 'Next' }).click();
      await wizard.getByText("Skip adding property now. I'll add it manually later").click();
      return this.finishCreateWizard(wizard, accountName);
    }

    // Street-only suggestions (no house number) can fail to resolve, so pick a numbered one.
    const address = wizard.getByRole('combobox', { name: 'Search Address' });
    const street = this.page.getByRole('textbox', { name: 'Street' });
    // Seen QA 2026-10-21: a suggestion sometimes never resolves (Street stays empty and Finish
    // silently fails), so retry with a fresh search until the address fields fill in.
    for (let attempt = 1; attempt <= 3; attempt++) {
      await address.click();
      await address.fill('');
      await address.pressSequentially(String(10 + Math.floor(Math.random() * 990)), { delay: 80 });
      const listboxId = await address.getAttribute('aria-controls');
      const options = this.page.locator(`[id="${listboxId}"] [role="option"]`);
      await options.first().waitFor({ state: 'visible', timeout: 15000 });
      const texts = (await options.allInnerTexts()).map((t) => t.trim());
      const numbered = texts.map((_, i) => i).filter((i) => /^\d/.test(texts[i]));
      const pool = numbered.length ? numbered : texts.map((_, i) => i);
      await options.nth(pool[Math.floor(Math.random() * pool.length)]).click();
      const resolved = await expect(street).not.toHaveValue('', { timeout: 15000 }).then(() => true, () => false);
      if (resolved) break;
      if (attempt === 3) throw new Error('No address suggestion filled in the Street field after 3 tries');
    }

    await wizard.getByRole('button', { name: 'Next' }).click();
    if (opts.arv) await wizard.getByRole('spinbutton', { name: 'ARV', exact: true }).fill(opts.arv);
    return this.finishCreateWizard(wizard, accountName);
  }

  private async finishCreateWizard(wizard: Locator, accountName: string): Promise<string> {
    await wizard.getByRole('button', { name: 'Finish' }).click();
    // Lands on ".../crm/opportunity/<id>/<slug>", possibly via a transient ".../<id>/detail".
    await this.page.waitForURL(/\/crm\/opportunity\/[^/]+\/(?!detail\/?$)[^/]+\/?$/, { timeout: 60000 });
    await this.waitForSpinner(25000);
    await this.marketplaceCtaButton.waitFor({ state: 'visible', timeout: 30000 });
    const name = decodeURIComponent(new URL(this.page.url()).pathname.split('/').pop() ?? '');
    console.log(`  [SellerLead] created seller op "${name}" for ${accountName}`);
    return name;
  }

  /**
   * Reads a Details-tab field value, e.g. "Lead Type" → "Corporate". Leaves the
   * Details tab active. Label and value render on consecutive lines.
   */
  async getDetailField(label: string): Promise<string> {
    await this.page.getByRole('tab', { name: 'Details', exact: true }).first().click();
    const field = this.page.getByText(label, { exact: true }).first();
    await field.waitFor({ state: 'visible', timeout: 15000 });
    const text = await field.locator('xpath=..').innerText();
    return text.replace(label, '').trim().split('\n')[0].trim();
  }

  /** Corp deals carry Lead Type "Corporate" (live-verified QA 2026-10-06, MPD-05032). */
  async isCorpDeal(): Promise<boolean> {
    return (await this.getDetailField('Lead Type')) === 'Corporate';
  }

  async getAccountName(): Promise<string> {
    return ((await this.accountLink.textContent()) ?? '').trim();
  }

  async getOpportunityOwner(): Promise<string> {
    return this.getDetailField('Opportunity Owner');
  }

  /** Opens the "New Deal" dialog — see `this.marketplaceListing` for the dialog itself. */
  async clickMarketplaceCta() {
    await this.marketplaceCtaButton.click();
    await this.marketplaceListing.waitForDealTypeStep();
  }

  /**
   * Clicks "View in Marketplace" on an already-listed Opportunity and returns
   * the page the deal opened on — this tab, or a new one if the CTA opens it
   * in a new tab (the Home "Marketplace" quick link does that sometimes).
   */
  async clickViewInMarketplace(): Promise<Page> {
    const newTab = this.page.context().waitForEvent('page', { timeout: 8000 }).catch(() => null);
    await this.marketplaceCtaButton.click();
    const opened = await newTab;
    if (opened) await opened.waitForLoadState('domcontentloaded');
    return opened ?? this.page;
  }

  /**
   * Opens this Opportunity's Lead Contact, ticks one of its opt-out checkboxes in Edit
   * and saves, then comes back to the Opportunity (live-verified QA 2026-10-11: both are
   * editable by the Owner; the read-only SMS flags are not).
   */
  async setContactOptOut(field: 'Do Not Call' | 'Email Opt Out') {
    const oppUrl = this.page.url();
    await this.clickContactLink();
    await this.page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const box = this.page.getByRole('checkbox', { name: field, exact: true }).first();
    await box.waitFor({ state: 'attached', timeout: 15000 });
    if (!(await box.isChecked())) {
      // The first matching label is a hidden copy; click the visible one, else tick the input itself.
      await this.page.locator('label:visible').filter({ hasText: new RegExp(`^${field}$`) }).first().click({ timeout: 5000 })
        .catch(() => box.check({ force: true }));
    }
    await expect(box, `${field} ticked`).toBeChecked({ timeout: 5000 });
    await this.page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await this.page.getByText(new RegExp(`${field}\\s*True`)).first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    await this.page.goto(oppUrl);
    await this.waitForSpinner(25000);
  }

  /** Closed Lost with Sub Stage "Do Not Contact" (needs a Loss Reason and a reason for not meeting). */
  async closeLostDoNotContact() {
    // QA 2026-10-26: the record opens on Details, and Closed Lost's Sub Stage options render only on Stage Wizard.
    await this.page.getByRole('tab', { name: 'Stage Wizard', exact: true }).first().click();
    await this.waitForSpinner();
    await this.page.getByRole('button', { name: 'Closed Lost', exact: true }).click();
    const doNotContact = this.page.getByRole('radio', { name: 'Do Not Contact' });
    await doNotContact.waitFor({ state: 'visible', timeout: 30000 });
    // Seen QA 2026-10-21: a spinner covers the Sub Stage options while they re-render after Closed Lost.
    await this.waitForSpinner(30000);
    await this.page.mouse.move(0, 0); // a header hover card can cover the options (see setSubStage)
    // The radio input itself never takes a check(); its label does (QA 2026-10-26).
    await this.page.getByText('Do Not Contact', { exact: true }).first().click();
    await this.page.getByRole('combobox', { name: 'Loss Reason' }).click();
    // Not "Take Me Off List": since QA 2026-10-26 saving it sends the user off to a webform.
    await this.page.getByRole('option', { name: 'Not a Fit', exact: true }).click();
    await this.page.getByText('I did not meet with this seller.', { exact: true }).click();
    await this.page.locator('[name="Reason_for_not_meeting__c"]').fill('Seller asked not to be contacted');
    await this.page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await this.waitForStabilization(4000);
  }

  /** Clicks "List in Marketplace" expecting an eligibility refusal; returns the error toast text ('' if none). */
  async attemptListingExpectingError(): Promise<string> {
    await this.page.getByText('List in Marketplace', { exact: true }).first().click();
    const toast = this.page.locator('.slds-notify, [role="alert"]').filter({ hasText: /\S/ }).first();
    return toast.waitFor({ state: 'visible', timeout: 15000 })
      .then(async () => ((await toast.innerText()) || '').replace(/\s+/g, ' ').trim(), () => '');
  }

  /** Clicks "List in Marketplace"; returns every distinct toast shown ([] when listing is allowed). */
  async attemptListingCollectingToasts(): Promise<string[]> {
    await this.page.getByText('List in Marketplace', { exact: true }).first().click();
    const toasts = this.page.locator('.slds-notify');
    await toasts.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await this.page.waitForTimeout(3000); // eligibility toasts arrive one after another
    const texts = (await toasts.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return [...new Set(texts)];
  }

  /** Stage Wizard: picks a Sub Stage radio and saves (live-verified QA 2026-10-11: "Success" toast, value persists). */
  async setSubStage(subStage: string) {
    await this.page.getByRole('tab', { name: 'Stage Wizard', exact: true }).first().click();
    await this.waitForSpinner();
    // Seen QA 2026-10-11: a header hover card (Phone / Billing Address) left open by the pointer covers the options.
    await this.page.mouse.move(0, 0);
    await this.page.getByText(subStage, { exact: true }).first().click();
    await this.page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await this.page.getByText('Success', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 });
    await this.waitForStabilization(2000);
  }

  /** True when the Timeline lists a logged call ("You logged a call" / "<name> logged a call"). */
  async hasLoggedCallInTimeline(): Promise<boolean> {
    await this.page.getByRole('tab', { name: 'Timeline' }).first().click();
    return this.page.getByText(/logged a call/i).first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false);
  }

  /** True when the opened record actually renders (its Account link shows) — false for a record this user can't access. */
  async isRecordShown(): Promise<boolean> {
    return this.accountLink.waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false);
  }

  // ==================== Assertions ====================

  async expectRecordHeaderVisible() {
    await this.waitForSpinner(20000);
    console.log(`  [SellerLead] Account link visible = ${await this.accountLink.isVisible().catch(() => false)}`);
  }

  async expectStageHistoryVisible() {
    const visible = await this.stageHistorySection.isVisible().catch(() => false);
    console.log(`  [SellerLead] Stage History section visible = ${visible}`);
  }

  /** No timestamp in the Timeline should carry a leading zero (e.g. "9:05 AM", not "09:05 AM"). */
  async expectNoLeadingZeroTimestamps() {
    const timestamps = await this.getTimelineTimestamps();
    for (const ts of timestamps) {
      expect(ts, `Timestamp "${ts}" should not have a leading zero`).not.toMatch(/^0\d:/);
    }
  }
}

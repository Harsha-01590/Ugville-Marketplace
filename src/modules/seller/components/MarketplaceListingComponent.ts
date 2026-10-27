import { type Page, type Locator, expect } from '@playwright/test';

export type MarketplaceDealType = 'Assignment' | 'Opportunity';

/** Step 1's helper text under each listing-type radio, as specified in the Marketplace_Master sheet (LF_002). */
export const DEAL_TYPE_DESCRIPTIONS: Record<MarketplaceDealType, string> = {
  Assignment:
    'This will allow you to assign the contract for this opportunity to another franchise and create the necessary records for each franchise.',
  Opportunity:
    'This allows you to sell this opportunity to another franchise. The opportunity record and all related notes will be transferred to the buying franchise.',
};

/**
 * The "New Deal" dialog opened from a Seller Opportunity's "List in
 * Marketplace" CTA (see `SellerLeadPage.clickMarketplaceCta()`). A 2-step
 * wizard: step 1 picks the deal type (Assignment/Opportunity radio + Next),
 * step 2 is the deal-details form (Location/Deal Terms/Opportunity Details/
 * Estimated ARV/Direct Invite + Back/Save, or the dialog's own "✕" to
 * discard the whole flow without creating a Marketplace Deal).
 */
export class MarketplaceListingComponent {
  private readonly page: Page;

  // ==================== Locators ====================

  private readonly dealTypeDialogHeading: Locator;
  private readonly dealTypePrompt: Locator;
  /** Step 1's own "Cancel" button, distinct from the dialog's "✕" (`cancelAndCloseButton`). */
  private readonly dealTypeStepCancelButton: Locator;
  /** Step 1 (deal type) and step 2 (deal form) each render their own Next/Save button. */
  private readonly nextButton: Locator;
  private readonly backButton: Locator;
  private readonly saveButton: Locator;
  /** The dialog's own "✕" — discards the whole in-progress listing flow without creating a deal. */
  private readonly cancelAndCloseButton: Locator;
  /**
   * Live-verified QA 2026-10-06: Assignment renders "New Assignment Deal" but
   * Opportunity renders plain "New Deal" — the same text as step 1's heading —
   * so step-2 presence is detected via `dealTermsInput` (step-2-only), not this.
   */
  private readonly formHeading: Locator;
  private readonly locationInput: Locator;
  private readonly dealTermsInput: Locator;
  private readonly opportunityDetailsInput: Locator;
  private readonly estimatedArvInput: Locator;
  private readonly directInviteCombobox: Locator;
  /** Scoped to the picker's own listbox — the Opportunity page renders other listboxes whose options would otherwise be read instead. */
  private readonly directInviteOptions: Locator;
  /** Direct Invite is a single-select record picker: a pick shows a "Clear Direct Invite Selection" button (live-verified QA 2026-10-09). */
  private readonly clearDirectInviteButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dealTypeDialogHeading = page.getByRole('heading', { name: 'New Deal' });
    this.dealTypePrompt = page.getByText('List this Marketplace Deal as:');
    this.dealTypeStepCancelButton = page.getByRole('button', { name: 'Cancel', exact: true });
    this.nextButton = page.getByRole('button', { name: 'Next', exact: true });
    this.backButton = page.getByRole('button', { name: 'Back', exact: true });
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
    this.cancelAndCloseButton = page.getByRole('button', { name: 'Cancel and close' });
    this.formHeading = page.getByRole('heading', { name: /^New (\w+ )?Deal$/ });
    this.locationInput = page.getByRole('textbox', { name: 'Location' });
    this.dealTermsInput = page.getByRole('textbox', { name: 'Deal Terms' });
    this.opportunityDetailsInput = page.getByRole('textbox', { name: 'Opportunity Details' });
    this.estimatedArvInput = page.getByRole('spinbutton', { name: 'Estimated ARV' });
    this.directInviteCombobox = page.getByRole('combobox', { name: 'Direct Invite' });
    this.directInviteOptions = page.getByRole('listbox', { name: 'Direct Invite' }).getByRole('option');
    this.clearDirectInviteButton = page.getByRole('button', { name: 'Clear Direct Invite Selection' });
  }

  /** Radio labels only, exact text — some Opportunity pages render "Opportunity Owner"/"Opportunity Name" field labels behind the dialog (live-verified QA 2026-10-06). */
  private dealTypeRadioLabel(type: MarketplaceDealType): Locator {
    return this.page.locator('label.slds-radio__label').filter({ hasText: new RegExp(`^\\s*${type}\\s*$`) });
  }

  /** Anchored regex — the accessible name may also carry the description text, which mentions "opportunity". */
  private dealTypeRadio(type: MarketplaceDealType): Locator {
    return this.page.getByRole('radio', { name: new RegExp(`^${type}`) });
  }

  /** Step 1's helper text under a deal-type radio. */
  private dealTypeDescription(type: MarketplaceDealType): Locator {
    return this.page.getByText(DEAL_TYPE_DESCRIPTIONS[type]);
  }

  /** A Direct Invite suggestion for the named franchise. */
  private directInviteOption(name: string): Locator {
    return this.directInviteOptions.filter({ hasText: name }).first();
  }

  /** First element anywhere in the dialog showing `text`. */
  private textOnPage(text: string): Locator {
    return this.page.getByText(text).first();
  }

  // ==================== Actions ====================

  async waitForDealTypeStep(timeout = 15000) {
    await this.dealTypeDialogHeading.waitFor({ state: 'visible', timeout });
  }

  /** Step 1 — deal type radio + Next. */
  async selectDealType(type: MarketplaceDealType) {
    await this.chooseDealType(type);
    await this.clickNext();
  }

  /** Step 1 — picks a radio without advancing. SLDS radios render a styled span that intercepts pointer events, so the click targets the <label> text, not the input. */
  async chooseDealType(type: MarketplaceDealType) {
    await this.dealTypeRadioLabel(type).click();
  }

  async clickNext() {
    await this.nextButton.click();
    await this.dealTermsInput.waitFor({ state: 'visible', timeout: 15000 });
  }

  async isNextEnabled(): Promise<boolean> {
    return this.nextButton.isEnabled();
  }

  async isDealTypeSelected(type: MarketplaceDealType): Promise<boolean> {
    return this.dealTypeRadio(type).isChecked();
  }

  /** LF_002 — title, prompt, both radios with their sheet-specified descriptions, and the Cancel/Next buttons. */
  async expectDealTypeStepContent() {
    await expect(this.dealTypeDialogHeading).toBeVisible();
    await expect(this.dealTypePrompt).toBeVisible();
    for (const type of ['Assignment', 'Opportunity'] as const) {
      await expect(this.dealTypeRadio(type)).toBeAttached();
      await expect(this.dealTypeDescription(type)).toBeVisible();
    }
    await expect(this.dealTypeStepCancelButton).toBeVisible();
    await expect(this.nextButton).toBeVisible();
  }

  /** Step 1's own Cancel — closes the dialog without creating a deal. */
  async cancelDealTypeStep() {
    await this.dealTypeStepCancelButton.click();
    await this.dealTypeDialogHeading.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async getFormHeadingText(): Promise<string> {
    return ((await this.formHeading.textContent()) ?? '').trim();
  }

  async isDealFormOpen(): Promise<boolean> {
    return this.dealTermsInput.isVisible().catch(() => false);
  }

  /** LF_007/LF_008 — every field and button of step 2 renders. */
  async expectDealFormFieldsVisible() {
    for (const field of [
      this.locationInput,
      this.dealTermsInput,
      this.opportunityDetailsInput,
      this.estimatedArvInput,
    ]) {
      await expect(field).toBeVisible();
    }
    expect(await this.isDirectInviteVisible(), 'Direct Invite field should render on the deal details form').toBe(true);
    await expect(this.backButton).toBeVisible();
    await expect(this.saveButton).toBeVisible();
  }

  async getLocationValue(): Promise<string> {
    return this.locationInput.inputValue();
  }

  /**
   * The Location field auto-fills from the property address asynchronously
   * after the form renders — reading `inputValue()` right after `Next` is a
   * race that can catch it still empty. Asserting on the locator directly
   * lets Playwright retry until the value lands (or the timeout is real).
   */
  async expectLocationValue(value: string, timeout = 15000) {
    await expect(this.locationInput).toHaveValue(value, { timeout });
  }

  async isLocationDisabled(): Promise<boolean> {
    return !(await this.locationInput.isEnabled());
  }

  async fillDealTerms(text: string) {
    await this.dealTermsInput.fill(text);
  }

  async getDealTermsValue(): Promise<string> {
    return this.dealTermsInput.inputValue();
  }

  async fillOpportunityDetails(text: string) {
    await this.opportunityDetailsInput.fill(text);
  }

  async getOpportunityDetailsValue(): Promise<string> {
    return this.opportunityDetailsInput.inputValue();
  }

  async isDealTermsRequired(): Promise<boolean> {
    return this.isRequired(this.dealTermsInput);
  }

  async isOpportunityDetailsRequired(): Promise<boolean> {
    return this.isRequired(this.opportunityDetailsInput);
  }

  async isDealTermsInvalid(): Promise<boolean> {
    return (await this.dealTermsInput.getAttribute('aria-invalid')) === 'true';
  }

  async isOpportunityDetailsInvalid(): Promise<boolean> {
    return (await this.opportunityDetailsInput.getAttribute('aria-invalid')) === 'true';
  }

  private async isRequired(field: Locator): Promise<boolean> {
    if ((await field.getAttribute('aria-required')) === 'true') return true;
    return field.evaluate((el) => (el as HTMLInputElement | HTMLTextAreaElement).required);
  }

  async isEstimatedArvDisabled(): Promise<boolean> {
    return !(await this.estimatedArvInput.isEnabled());
  }

  async getEstimatedArvValue(): Promise<string> {
    return this.estimatedArvInput.inputValue();
  }

  async clearEstimatedArv() {
    await this.estimatedArvInput.evaluate((el: HTMLInputElement) => {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /**
   * Types real keystrokes rather than filling the value in one shot — this
   * field's numeric/comma-only filtering is keystroke-driven (each keypress
   * is individually validated), live-verified: `.fill()` sets the DOM value
   * directly and bypasses that per-keystroke filter entirely, silently
   * accepting input a real user never could type.
   */
  async typeEstimatedArv(text: string) {
    await this.estimatedArvInput.pressSequentially(text);
  }

  /** Leaves the field — amount shorthand ("250k") is expanded on blur. */
  async blurEstimatedArv() {
    await this.estimatedArvInput.blur();
  }

  /**
   * Live-verified (2026-08-11): Direct Invite renders last on the form,
   * after an async franchise-list fetch — checking visibility immediately
   * (no wait) can read `false` a moment before it actually appears.
   */
  async isDirectInviteVisible(): Promise<boolean> {
    await this.directInviteCombobox.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    return this.directInviteCombobox.isVisible().catch(() => false);
  }

  /** Types into Direct Invite's franchise search and waits for suggestions (or for none to appear). */
  async searchDirectInvite(term: string) {
    await this.directInviteCombobox.click();
    await this.directInviteCombobox.fill(''); // a cleared selection can leave the old search text behind
    await this.directInviteCombobox.pressSequentially(term, { delay: 50 });
    await this.directInviteOptions
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => {});
  }

  /** The options' accessible names — the record picker puts the franchise name in an attribute, not always in its text. */
  async getDirectInviteOptionLabels(): Promise<string[]> {
    const labels = await this.directInviteOptions.evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label') || el.getAttribute('title') || (el as HTMLElement).innerText || ''),
    );
    return labels.map((t) => t.trim()).filter(Boolean);
  }

  /** Picks a Direct Invite suggestion and returns its label. */
  async selectDirectInviteOption(index = 0): Promise<string> {
    const option = this.directInviteOptions.nth(index);
    const label = ((await option.textContent()) ?? '').trim();
    await option.click();
    return label;
  }

  /** Searches Direct Invite by the franchise name's first word and picks the exact franchise. */
  async selectDirectInviteFranchise(name: string) {
    await this.searchDirectInvite(name.split(/[\s,]+/)[0]);
    await this.directInviteOption(name).click();
  }

  async hasDirectInviteSelection(): Promise<boolean> {
    return this.clearDirectInviteButton.isVisible().catch(() => false);
  }

  async getDirectInviteSelectionCount(): Promise<number> {
    return this.clearDirectInviteButton.count();
  }

  async getDirectInviteValue(): Promise<string> {
    return this.directInviteCombobox.inputValue().catch(() => '');
  }

  async clearDirectInviteSelection() {
    await this.clearDirectInviteButton.click();
    await this.clearDirectInviteButton.waitFor({ state: 'hidden', timeout: 10000 });
  }

  /** Empties the Direct Invite search text (not a selection — see clearDirectInviteSelection). */
  async clearDirectInviteSearch() {
    await this.directInviteCombobox.fill('');
  }

  /** LF_027 — a quick double click on Save, to check only one deal gets created. */
  async doubleClickSave() {
    await this.saveButton.dblclick();
    await this.dealTermsInput.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  }

  async isTextShown(text: string): Promise<boolean> {
    return this.textOnPage(text)
      .isVisible()
      .catch(() => false);
  }

  async clickBack() {
    await this.backButton.click();
    await this.dealTypeDialogHeading.waitFor({ state: 'visible', timeout: 15000 });
  }

  /** Submits the deal form — this is the real, sandbox-mutating "create a Marketplace deal" action. */
  async save() {
    await this.saveButton.click();
    await this.dealTermsInput.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
  }

  /**
   * Clicks Save expecting client-side validation to block it (LF_010-012), so it
   * doesn't wait for the form to close. If validation isn't enforced this still
   * submits a real listing — only call it on a disposable listing fixture.
   */
  async clickSaveExpectingValidation() {
    await this.saveButton.click();
    await this.page.waitForTimeout(1500);
  }

  /** Discards the in-progress listing flow (from either step) — no deal is created. */
  async cancelAndClose() {
    await this.cancelAndCloseButton.click();
    await this.dealTermsInput.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }
}

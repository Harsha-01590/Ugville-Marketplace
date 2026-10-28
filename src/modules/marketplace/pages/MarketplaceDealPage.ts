import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from '@shared/pages/base/BasePage';
import { Logger } from '@utils/logger';

/**
 * Page Object for a single Marketplace deal's detail view, opened by
 * clicking "View Deal" on a card in `MarketplacePage`.
 *
 * Live-verified against the QA sandbox: this is a MODAL dialog ("Marketplace
 * Deal Details" heading), not a page navigation — it never gets its own URL.
 * The modal shows Location / Deal Terms / Opportunity Details / Estimated
 * ARV / property image, a link back to the source Opportunity, and (for an
 * eligible, not-yet-bid deal) an inline "Bid Details" form: a Bidding
 * Franchise dropdown (only rendered for multi-franchise accounts) + a
 * Reason for Bid textbox + Cancel/Place Bid. Clicking Place Bid is expected
 * to raise a second confirmation popup with a Terms of Use checkbox gating
 * Confirm (per the spreadsheet's Place Bid flow) — that popup's exact
 * locators aren't verified live yet, so `confirmBid()` covers both the
 * single-step and two-step shapes.
 */
export type InviteAction = 'Accept' | 'Decline';

export class MarketplaceDealPage extends BasePage {
  readonly modalHeading: Locator;
  private readonly mpdIdText: Locator;
  private readonly sourceOpportunityLink: Locator;
  private readonly locationText: Locator;
  private readonly dealTermsText: Locator;
  private readonly opportunityDetailsText: Locator;
  private readonly estimatedArvText: Locator;
  private readonly biddingFranchiseDropdown: Locator;
  private readonly ineligibilityMessage: Locator;
  private readonly alreadyBidMessage: Locator;
  private readonly withdrawBidButton: Locator;
  private readonly withdrawDealButton: Locator;
  private readonly acceptBidButtons: Locator;
  private readonly declineBidButtons: Locator;
  /** "Confirmation of Invite Acceptance" / "Confirmation of Invite Decline", stacked over the deal modal. */
  private readonly inviteConfirmDialog: Locator;
  private readonly dealDialog: Locator;
  private readonly termsOfUseCheckbox: Locator;
  /**
   * Live-verified 2026-08-21: same SLDS pattern as the deal-type radios in
   * `MarketplaceListingComponent` — the checkbox's styled `<span
   * class="slds-checkbox">` intercepts pointer events, so `.check()`/`.click()`
   * on the raw input retries forever. Clicking the label text (same
   * accessible name, "Terms of Use (legal text)") is what actually toggles it.
   */
  private readonly termsOfUseLabel: Locator;
  private readonly confirmButton: Locator;
  private readonly bidHistorySection: Locator;
  private readonly bidListRows: Locator;
  /**
   * The spreadsheet's "7 additional fields" (Deal Stage / Listed Date / Opp
   * Transferred / Seller Stage / Last Activity / Purchased / Sold Date).
   * Live-verified: only a subset renders depending on deal state — an
   * active (not-yet-won) deal showed just Deal Stage/Listed Date/Last
   * Activity; Opp Transferred/Seller Stage/Purchased/Sold Date appear to be
   * won-state-only fields, per the spreadsheet's UF_006-009 rows.
   *
   * Each label is its own `<span class="mp-deal-details">Label:</span>`
   * with the value as a trailing text node on the *parent* element (same
   * structure as the deal card's fields in MarketplacePage) — the label
   * locator's own textContent never includes the value.
   */
  private readonly additionalFieldItems: Locator;
  /**
   * "Confirm to Bid for this Deal" — Deal Terms, Reason for Bid, Terms of Use, Cancel/Confirm (live-verified QA
   * 2026-10-09).
   */
  private readonly placeBidConfirmDialog: Locator;
  /** The Listing Franchise's "Confirmation of Bid Acceptance/Decline" popup, stacked over the deal modal. */
  private readonly bidDecisionDialog: Locator;
  readonly bidReasonInput: Locator;
  readonly placeBidButton: Locator;
  readonly cancelButton: Locator;
  readonly cancelAndCloseButton: Locator;
  /** Options of the most recently opened listbox (the Bidding Franchise dropdown). */
  private readonly lastListboxOptions: Locator;
  private readonly firstDropdownOption: Locator;
  /** Close buttons on every open toast. */
  private readonly toastCloseButtons: Locator;
  /** The first toast with real text (not the transient "Loading" one). */
  private readonly firstToast: Locator;
  /** A generic "Yes" / "Confirm" button, if a withdraw ever asks to confirm. */
  private readonly yesOrConfirmButton: Locator;
  /** The confirm-step "Decline Bid" button (last on the page — the popup's, not the row's). */
  private readonly declineBidConfirmButton: Locator;
  /** "Assignment" / "Opportunity" type badge in the deal modal. */
  private readonly dealTypeBadge: Locator;
  private readonly placeBidConfirmDialogConfirmButton: Locator;
  private readonly placeBidConfirmDialogCancelButton: Locator;
  private readonly bidDecisionDialogButtons: Locator;
  /** The popup's Confirm (or its own "Accept Bid"). */
  private readonly bidDecisionConfirmButton: Locator;
  private readonly bidDecisionCancelButton: Locator;
  private readonly bidDecisionDeclineButton: Locator;
  private readonly inviteConfirmDialogConfirmButton: Locator;
  private readonly inviteConfirmDialogCancelButton: Locator;
  private readonly inviteConfirmDialogDeclineButton: Locator;
  /** Link to the source Opportunity, scoped to the deal modal. */
  private readonly dialogSourceOpportunityLink: Locator;
  /** "CORP" badge — deals listed from a Lead Type "Corporate" opportunity. */
  private readonly corpBadge: Locator;
  private readonly dealStatusBadge: Locator;
  private readonly propertyInfoSection: Locator;
  /** Every image in the deal modal (property photo, Google image or placeholder drawing). */
  private readonly dealDialogImages: Locator;
  /** The Reason for Bid length error (any message naming Reason for Bid and the 1000-character limit). */
  readonly bidReasonLengthError: Locator;

  /** Invited Franchise's two actions on a pending Direct Invite (live-verified QA 2026-10-06). */
  readonly getInviteButton: (action: InviteAction) => Locator;
  /** An option of the open dropdown, by exact name. */
  readonly getDropdownOption: (name: string) => Locator;
  /** The parent of a "Label:" span — its value is a trailing text node there, not inside the span. */
  readonly getLabelledValue: (label: Locator) => Locator;
  /** The innermost row in the deal modal holding `franchise`'s name and the given bid button. */
  readonly getBidRowFor: (franchise: string, button: Locator) => Locator;
  /** The Accept/Decline Bid `button` inside `franchise`'s bid row. */
  readonly getBidRowButton: (franchise: string, button: Locator) => Locator;

  constructor(page: Page) {
    super(page);
    // No data-testid exists in this UI (Salesforce LWR site; confirmed via live inspection of QA on 2026-10-27,
    // shadow DOM included), so every locator below falls back to role/text/CSS.
    this.modalHeading = page.getByRole('heading', { name: 'Marketplace Deal Details' });
    this.dealDialog = page.getByRole('dialog').filter({ has: this.modalHeading });
    // Scoped to the modal: the deal cards behind it carry MPD ids too.
    this.mpdIdText = this.dealDialog.getByText(/^MPD-\d+$/).first();
    this.sourceOpportunityLink = page
      .getByRole('link')
      .filter({ hasText: /-\s*(S|B)$/ })
      .first();
    this.locationText = this.dealDialog.getByText(/^Location:/).first();
    this.dealTermsText = page.getByText(/^Deal Terms:/).first();
    this.opportunityDetailsText = page.getByText(/^Opportunity Details:/).first();
    this.estimatedArvText = this.dealDialog.getByText(/^Estimated ARV:/).first();
    this.biddingFranchiseDropdown = page.getByRole('combobox', { name: 'Bidding Franchise' });
    this.ineligibilityMessage = page
      .getByText(/not eligible|ineligib(le|ility)|Opted Out|Do Not Call|no.*associated Franchise/i)
      .first();
    this.alreadyBidMessage = page.getByText(/You have already bid/i).first();
    this.withdrawBidButton = page.getByRole('button', { name: /withdraw bid/i });
    this.withdrawDealButton = page.getByRole('button', { name: /withdraw deal/i });
    this.acceptBidButtons = page.getByRole('button', { name: /^accept bid$/i });
    this.declineBidButtons = page.getByRole('button', { name: /^decline bid$/i });
    this.inviteConfirmDialog = page
      .getByRole('dialog')
      .filter({ hasText: /Confirmation of Invite (Acceptance|Decline)/ });
    this.termsOfUseCheckbox = page.getByRole('checkbox', { name: /terms of use/i });
    this.termsOfUseLabel = page.locator('label').filter({ hasText: /terms of use/i });
    this.confirmButton = page.getByRole('button', { name: /^confirm$/i });
    this.bidHistorySection = page.getByText(/bid (history|list|details)/i).first();
    this.bidListRows = page.locator('[class*="bid-list"] [class*="row"], [class*="bidList"] [class*="item"]');
    // Scoped to the deal modal: the cards behind it carry their own "Last Activity:" label.
    this.additionalFieldItems = this.dealDialog.getByText(
      /^(Deal Stage|Listed Date|Opp Transferred|Seller Stage|Last Activity|Purchased|Sold Date):/,
    );
    this.placeBidConfirmDialog = page.getByRole('dialog').filter({ hasText: 'Confirm to Bid for this Deal' });
    this.bidDecisionDialog = page.getByRole('dialog').filter({ hasText: /Confirmation of Bid|this Bid\?/i });
    this.bidReasonInput = page.getByRole('textbox', { name: /Reason for [Bb]id/ });
    this.placeBidButton = page.getByRole('button', { name: 'Place Bid', exact: true });
    this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });
    this.cancelAndCloseButton = page.getByRole('button', { name: 'Cancel and close' });
    this.lastListboxOptions = page.getByRole('listbox').last().getByRole('option');
    this.firstDropdownOption = page.getByRole('option').first();
    this.toastCloseButtons = page
      .locator('.slds-notify, [role="alert"], [role="status"]')
      .getByRole('button', { name: /close/i });
    this.firstToast = page
      .locator('.slds-notify, [role="alert"], [role="status"]')
      .filter({ hasText: /\S/ })
      .filter({ hasNotText: /^\s*Loading/ })
      .first();
    this.yesOrConfirmButton = page.getByRole('button', { name: /yes|confirm/i }).first();
    this.declineBidConfirmButton = page.getByRole('button', { name: /^decline bid$/i }).last();
    this.dealTypeBadge = this.dealDialog.getByText(/^(Assignment|Opportunity)$/).first();
    this.placeBidConfirmDialogConfirmButton = this.placeBidConfirmDialog.getByRole('button', {
      name: 'Confirm',
      exact: true,
    });
    this.placeBidConfirmDialogCancelButton = this.placeBidConfirmDialog.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    this.bidDecisionDialogButtons = this.bidDecisionDialog.getByRole('button');
    this.bidDecisionConfirmButton = this.bidDecisionDialog
      .getByRole('button', { name: /^(confirm|accept bid)$/i })
      .last();
    this.bidDecisionCancelButton = this.bidDecisionDialog.getByRole('button', { name: 'Cancel', exact: true });
    this.bidDecisionDeclineButton = this.bidDecisionDialog.getByRole('button', { name: /^decline bid$/i }).last();
    this.inviteConfirmDialogConfirmButton = this.inviteConfirmDialog.getByRole('button', {
      name: 'Confirm',
      exact: true,
    });
    this.inviteConfirmDialogCancelButton = this.inviteConfirmDialog.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    this.inviteConfirmDialogDeclineButton = this.inviteConfirmDialog.getByRole('button', {
      name: 'Decline Invite',
      exact: true,
    });
    this.dialogSourceOpportunityLink = this.dealDialog
      .getByRole('link')
      .filter({ hasText: /-\s*(S|B)$/ })
      .first();
    this.corpBadge = this.dealDialog.getByText('CORP', { exact: true });
    this.dealStatusBadge = page.locator('[class*="status"], [class*="badge"]').first();
    this.propertyInfoSection = page.locator('[class*="property"]').first();
    this.dealDialogImages = this.dealDialog.locator('img');
    this.bidReasonLengthError = page
      .getByText(/Reason for Bid/)
      .filter({ hasText: /1000/ })
      .first();
    this.getInviteButton = (action) => page.getByRole('button', { name: `${action} Invite`, exact: true });
    this.getDropdownOption = (name) => page.getByRole('option', { name, exact: true });
    this.getLabelledValue = (label) => label.locator('xpath=..');
    this.getBidRowFor = (franchise, button) =>
      this.dealDialog.locator('div, li, tr').filter({ hasText: franchise }).filter({ has: button }).last();
    this.getBidRowButton = (franchise, button) => this.getBidRowFor(franchise, button).locator(button).first();
  }

  /** The modal's "Deal Stage" additional field ('' when not shown). */
  async getDealStage(): Promise<string> {
    return this.getAdditionalField('Deal Stage');
  }

  /** The franchise named in "The winning franchise for this deal is: <F>." ('' when the deal isn't won). */
  async getWinningFranchise(): Promise<string> {
    return (await this.getDealDialogText()).match(/The winning franchise for this deal is: (.+?)\./i)?.[1] ?? '';
  }

  /** True when the modal names a winning franchise. */
  async hasWinningFranchise(): Promise<boolean> {
    return (await this.getWinningFranchise()) !== '';
  }

  /** The Reason for Bid length error's text. */
  async getBidReasonLengthErrorText(): Promise<string> {
    return this.bidReasonLengthError.innerText();
  }

  /** The text currently in the Reason for Bid field. */
  async getBidReasonValue(): Promise<string> {
    return this.bidReasonInput.inputValue();
  }

  /** True when the deal's bid list is empty. */
  async hasNoBids(): Promise<boolean> {
    return (await this.getBidHistoryCount()) === 0;
  }

  /** True while the deal modal is open. */
  async isOpen(): Promise<boolean> {
    return this.modalHeading.isVisible().catch(() => false);
  }

  /** One additional field's value by label ('' when the modal doesn't show it). */
  async getAdditionalField(label: string): Promise<string> {
    return (await this.getAdditionalFields())[label] ?? '';
  }

  async getAdditionalFields(): Promise<Record<string, string>> {
    const count = await this.additionalFieldItems.count();
    const fields: Record<string, string> = {};
    for (let i = 0; i < count; i++) {
      const text = ((await this.getLabelledValue(this.additionalFieldItems.nth(i)).textContent()) || '').trim();
      const [label, ...rest] = text.split(':');
      fields[label.trim()] = rest.join(':').trim();
    }
    return fields;
  }

  /** Franchise names in the Bidding Franchise dropdown ([] when it isn't shown — a single-franchise account). */
  async getBiddingFranchiseOptions(): Promise<string[]> {
    if (!(await this.biddingFranchiseDropdown.isVisible().catch(() => false))) return [];
    await this.biddingFranchiseDropdown.click();
    const options = this.lastListboxOptions;
    await options.first().waitFor({ state: 'visible', timeout: 15000 });
    const names = (await options.allInnerTexts()).map((t) => t.trim());
    await this.page.keyboard.press('Escape');
    return names;
  }

  /** Number of franchises in the Bidding Franchise dropdown — >1 confirms a genuinely multi-franchise account. */
  async getBiddingFranchiseOptionCount(): Promise<number> {
    return (await this.getBiddingFranchiseOptions()).length;
  }

  async expectLoaded(timeout = 60000): Promise<void> {
    await this.modalHeading.waitFor({ state: 'visible', timeout });
    await this.waitForStabilization(1000);
  }

  async close(): Promise<void> {
    // After a successful bid the modal closes itself, so a button can vanish mid-click; try each
    // way out in turn (short timeouts) and finish only once the modal has really gone.
    for (const exit of [
      () => this.cancelAndCloseButton.click({ timeout: 5000 }),
      () => this.cancelButton.click({ timeout: 5000 }),
      () => this.page.keyboard.press('Escape'),
    ]) {
      if (!(await this.modalHeading.isVisible().catch(() => false))) break;
      await exit().catch(() => {});
      await this.modalHeading.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }
    await this.waitForStabilization(1000);
  }

  async getMpdId(): Promise<string> {
    return ((await this.mpdIdText.textContent().catch(() => '')) || '').trim();
  }

  /** "Location: City, ST ZIP" — the value is a text node beside the label, so the parent is read. */
  async getLocationText(): Promise<string> {
    return (
      (await this.getLabelledValue(this.locationText)
        .innerText()
        .catch(() => '')) || ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** The deal's location value alone, without its "Location:" label (e.g. "Austin, TX 78701"). */
  async getLocation(): Promise<string> {
    return (await this.getLocationText()).replace(/^Location:\s*/, '').trim();
  }

  /** "Estimated ARV: $250,000" / "Estimated ARV: N/A" — value beside the label, like Location. */
  async getEstimatedArvText(): Promise<string> {
    return (
      (await this.getLabelledValue(this.estimatedArvText)
        .innerText()
        .catch(() => '')) || ''
    )
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * `expectLoaded()`'s 1s settle isn't always enough for this deal's bid
   * eligibility (server-computed, no visible spinner) to resolve — observed
   * as a flake where Place Bid still read visible on a Bid Accepted deal
   * right after the modal opened. Extra settle before the read.
   */
  async isEligibleToBid(): Promise<boolean> {
    await this.waitForStabilization(1500);
    return this.placeBidButton.isVisible().catch(() => false);
  }

  async getIneligibilityMessage(): Promise<string | null> {
    if (!(await this.ineligibilityMessage.isVisible().catch(() => false))) return null;
    return this.ineligibilityMessage.textContent();
  }

  async hasAlreadyBidMessage(): Promise<boolean> {
    return this.alreadyBidMessage.isVisible().catch(() => false);
  }

  async getAlreadyBidMessageText(): Promise<string> {
    return ((await this.alreadyBidMessage.textContent().catch(() => '')) || '').trim();
  }

  async clickPlaceBid(): Promise<void> {
    await this.placeBidButton.waitFor({ state: 'visible', timeout: 30000 });
    await this.placeBidButton.click();
    await this.waitForStabilization(1500);
  }

  async enterBidReason(text: string): Promise<void> {
    await this.bidReasonInput.waitFor({ state: 'visible', timeout: 30000 });
    await this.bidReasonInput.fill(text);
  }

  /** Bidding Franchise combobox only renders for multi-franchise accounts — no-op otherwise. */
  async selectFranchiseIfPresent(name?: string): Promise<void> {
    if (!(await this.biddingFranchiseDropdown.isVisible().catch(() => false))) return;
    // Already acting as it: re-picking sends no request, so the wait below would just time out.
    if (name && ((await this.biddingFranchiseDropdown.innerText().catch(() => '')) || '').trim() === name) return;
    await this.biddingFranchiseDropdown.click();
    const option = name ? this.getDropdownOption(name) : this.firstDropdownOption;
    await option.waitFor({ state: 'visible', timeout: 15000 });
    // A pick re-fetches that franchise's bid (`existingBidFranchise`); INVITED / Accept-Decline Invite render
    // only after it returns (QA 2026-10-15). Re-picking the current franchise sends nothing, hence the catch.
    const bidLoaded = this.page
      .waitForResponse(
        (r) => r.url().includes('/apex/execute') && (r.request().postData() ?? '').includes('existingBidFranchise'),
        { timeout: 10000 },
      )
      .catch(() => {});
    await option.click();
    await bidLoaded;
    await this.waitForStabilization(1000);
  }

  async isTermsOfUseCheckboxPresent(): Promise<boolean> {
    return this.termsOfUseCheckbox.isVisible().catch(() => false);
  }

  async isConfirmEnabled(): Promise<boolean> {
    return this.confirmButton.isEnabled().catch(() => false);
  }

  /** Ticks Terms of Use only if it isn't already ticked (the label click toggles it). */
  async tickTermsOfUse(): Promise<void> {
    if (!(await this.termsOfUseCheckbox.isChecked().catch(() => true))) await this.termsOfUseLabel.click();
  }

  /** "Assignment" / "Opportunity" type badge in the deal modal, or '' when none is shown. */
  async getDealTypeBadge(): Promise<string> {
    const badge = this.dealTypeBadge;
    return (await badge.isVisible().catch(() => false)) ? (await badge.innerText()).trim() : '';
  }

  async checkTermsOfUse(): Promise<void> {
    if (await this.termsOfUseCheckbox.isVisible().catch(() => false)) {
      await this.termsOfUseLabel.click();
    }
  }

  /**
   * Submits the bid — clicks a Terms-of-Use-gated Confirm popup if one appears, else falls back to Place Bid itself
   * acting as the submit.
   */
  async confirmBid(): Promise<void> {
    if (await this.confirmButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.checkTermsOfUse();
      await this.confirmButton.click();
    } else {
      await this.placeBidButton.click();
    }
    await this.waitForStabilization(3000);
  }

  /** Enters the reason, clicks Place Bid and returns the confirmation popup's text (whitespace-collapsed). */
  async openPlaceBidConfirmation(reason: string): Promise<string> {
    await this.enterBidReason(reason);
    await this.clickPlaceBid();
    await this.placeBidConfirmDialog.waitFor({ state: 'visible', timeout: 15000 });
    return (await this.placeBidConfirmDialog.innerText()).replace(/\s+/g, ' ').trim();
  }

  /**
   * Raw text of the "Confirm to Bid for this Deal" popup ('' when it isn't open).
   * Live-verified 2026-08-21: "Are you Sure..." and "Reason for Bid" are sibling
   * elements inside the popup, so the whole dialog is read, not one line.
   */
  async getPlaceBidConfirmationText(): Promise<string> {
    return (await this.placeBidConfirmDialog.textContent().catch(() => '')) || '';
  }

  async isPlaceBidConfirmEnabled(): Promise<boolean> {
    return this.placeBidConfirmDialogConfirmButton.isEnabled();
  }

  /**
   * Ticks Terms of Use (unless already ticked) and clicks Confirm. Doesn't wait
   * for the popup to close — a rejected bid (empty / over-long reason, duplicate,
   * wrong stage) leaves it open behind an error toast, which the caller asserts.
   */
  async submitPlaceBidConfirmation(): Promise<void> {
    if (!(await this.termsOfUseCheckbox.isChecked().catch(() => true))) await this.termsOfUseLabel.click();
    await this.placeBidConfirmDialogConfirmButton.click();
  }

  /**
   * Closes the confirmation popup (if still open) without bidding. A rejected bid closes it on its own, so it may
   * vanish mid-click.
   */
  async cancelPlaceBidConfirmation(): Promise<void> {
    const cancel = this.placeBidConfirmDialogCancelButton;
    if (await cancel.isVisible().catch(() => false)) await cancel.click({ timeout: 5000 }).catch(() => {});
    await this.placeBidConfirmDialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  /**
   * Closes any open toast. Error toasts are sticky and, with a long message
   * (the 1001-character Reason for Bid echo), cover the deal modal's buttons.
   */
  async dismissToasts(): Promise<void> {
    const close = this.toastCloseButtons;
    for (let i = (await close.count()) - 1; i >= 0; i--) {
      await close
        .nth(i)
        .click({ timeout: 3000 })
        .catch(() => {});
    }
  }

  /**
   * Text of the first toast to appear within `timeout` ('' if none) — success toasts are short-lived, so this polls
   * rather than asserting one string.
   */
  async waitForToastText(timeout = 15000): Promise<string> {
    const toast = this.firstToast;
    if (
      !(await toast
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false))
    )
      return '';
    return ((await toast.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  }

  /** Clicks Accept/Decline Bid on the `index`-th bid row and returns the popup's text (whitespace-collapsed). */
  async openBidDecision(action: InviteAction, index = 0): Promise<string> {
    await (action === 'Accept' ? this.acceptBidButtons : this.declineBidButtons).nth(index).click();
    await this.bidDecisionDialog.waitFor({ state: 'visible', timeout: 15000 });
    return (await this.bidDecisionDialog.innerText()).replace(/\s+/g, ' ').trim();
  }

  async getBidDecisionButtonLabels(): Promise<string[]> {
    return (await this.bidDecisionDialogButtons.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  async isBidDecisionConfirmEnabled(): Promise<boolean> {
    return this.bidDecisionConfirmButton.isEnabled();
  }

  async cancelBidDecision(): Promise<void> {
    await this.bidDecisionCancelButton.click();
    await this.bidDecisionDialog.waitFor({ state: 'hidden', timeout: 10000 });
  }

  /**
   * Accept confirms via Terms of Use + Confirm (or the popup's own "Accept Bid"); Decline via the popup's "Decline
   * Bid".
   */
  async confirmBidDecision(action: InviteAction): Promise<void> {
    if (action === 'Accept') {
      if (!(await this.termsOfUseCheckbox.isChecked().catch(() => true))) await this.termsOfUseLabel.click();
      await this.bidDecisionConfirmButton.click();
    } else {
      await this.bidDecisionDeclineButton.click();
    }
    await this.bidDecisionDialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
    await this.waitForStabilization(2000);
  }

  /**
   * Live-verified QA 2026-10-09: Withdraw Deal (like Withdraw Bid) acts at once —
   * no confirmation popup — and closes the deal modal. A confirm is still
   * clicked if one ever appears.
   */
  async withdrawDeal(): Promise<void> {
    await this.withdrawDealButton.click();
    const confirm = this.yesOrConfirmButton;
    if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
    await this.waitForStabilization(2000);
  }

  async hasWithdrawBidOption(): Promise<boolean> {
    return this.withdrawBidButton.isVisible().catch(() => false);
  }

  /**
   * Same settle-before-read reasoning as `isEligibleToBid()` — this button's availability is also server-computed with
   * no visible spinner.
   */
  async hasWithdrawDealOption(): Promise<boolean> {
    await this.waitForStabilization(1500);
    return this.withdrawDealButton.isVisible().catch(() => false);
  }

  async withdrawBid(): Promise<void> {
    await this.withdrawBidButton.click();
    const confirm = this.yesOrConfirmButton;
    if (await confirm.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirm.click();
    }
    await this.waitForStabilization(2000);
  }

  /** Same settle-before-read reasoning as `isEligibleToBid()`. */
  async hasInviteActions(): Promise<boolean> {
    await this.waitForStabilization(1500);
    return (
      (await this.getInviteButton('Accept')
        .isVisible()
        .catch(() => false)) &&
      (await this.getInviteButton('Decline')
        .isVisible()
        .catch(() => false))
    );
  }

  /** Clicks Accept/Decline Invite and returns the confirmation popup's text. */
  async openInviteConfirmation(action: InviteAction): Promise<string> {
    await this.getInviteButton(action).click();
    await this.inviteConfirmDialog.waitFor({ state: 'visible', timeout: 15000 });
    return (await this.inviteConfirmDialog.innerText()).trim();
  }

  /** `openInviteConfirmation()`, returning the popup text with its whitespace collapsed to single spaces. */
  async openInviteConfirmationText(action: InviteAction): Promise<string> {
    return (await this.openInviteConfirmation(action)).replace(/\s+/g, ' ');
  }

  async isInviteConfirmEnabled(): Promise<boolean> {
    return this.inviteConfirmDialogConfirmButton.isEnabled();
  }

  async isTermsOfUseChecked(): Promise<boolean> {
    return this.termsOfUseCheckbox.isChecked();
  }

  async cancelInviteConfirmation(): Promise<void> {
    await this.inviteConfirmDialogCancelButton.click();
    await this.inviteConfirmDialog.waitFor({ state: 'hidden', timeout: 10000 });
  }

  /** Accept confirms via Terms of Use + "Confirm"; Decline via the popup's own "Decline Invite". */
  async confirmInvite(action: InviteAction): Promise<void> {
    if (action === 'Accept') {
      if (!(await this.isTermsOfUseChecked())) {
        await this.termsOfUseLabel.click({ timeout: 5000 }).catch(() => this.termsOfUseCheckbox.check({ force: true }));
      }
      await this.inviteConfirmDialogConfirmButton.click();
    } else {
      await this.inviteConfirmDialogDeclineButton.click();
    }
    await this.inviteConfirmDialog.waitFor({ state: 'hidden', timeout: 30000 });
    await this.waitForStabilization(3000);
  }

  /**
   * The Opportunity record this franchise reaches from the deal ('' if none).
   * Live-verified QA 2026-10-06: after an Opportunity-type accept the listing
   * franchise loses this link; after an Assignment-type accept each franchise
   * links to its own record (the winner gets a new copy).
   */
  async getSourceOpportunityHref(): Promise<string> {
    const link = this.dialogSourceOpportunityLink;
    if (!(await link.isVisible().catch(() => false))) return '';
    return link.evaluate((a) => (a as HTMLAnchorElement).href);
  }

  /** Salesforce id of the Opportunity the modal links to ('' when it shows no link). */
  async getSourceOpportunityId(): Promise<string> {
    return (await this.getSourceOpportunityHref()).match(/\/opportunity\/([A-Za-z0-9]{15,18})/)?.[1] ?? '';
  }

  /** The `href` of the first source-Opportunity link on the page (null when there is none). */
  async getSourceOpportunityLinkHref(): Promise<string | null> {
    return this.sourceOpportunityLink.getAttribute('href').catch(() => null);
  }

  /** "CORP" badge — deals listed from a Lead Type "Corporate" opportunity. */
  async hasCorpBadge(): Promise<boolean> {
    return this.corpBadge.isVisible().catch(() => false);
  }

  /** The resolved `src` of every image in the deal modal. */
  async getDealDialogImageSources(): Promise<string[]> {
    return this.dealDialogImages.evaluateAll((imgs) =>
      imgs.map((i) => (i as HTMLImageElement).currentSrc || i.getAttribute('src') || ''),
    );
  }

  /** Waits (up to `timeout`) for the deal modal to be gone; never throws. */
  /**
   * True when the modal shows the Google property image. That image is fetched and stored on the record
   * (rtaImage servlet) and swapped in after the modal opens; the fallback is a static-resource drawing.
   */
  async showsGooglePropertyImage(waitMs = 1500): Promise<boolean> {
    const isGoogle = async (): Promise<boolean> =>
      (await this.getDealDialogImageSources()).some((src) => /rtaImage/.test(src));
    await expect.poll(isGoogle, { timeout: waitMs }).toBe(true).catch(() => {});
    return isGoogle();
  }

  /** The labels of the additional fields the modal shows (Deal Stage, Listed Date, …). */
  async getAdditionalFieldNames(): Promise<string[]> {
    return Object.keys(await this.getAdditionalFields());
  }

  /** The additional fields whose label ends in "Date" and that hold a real value (not "N/A"). */
  async getAdditionalDateFields(): Promise<Record<string, string>> {
    const fields = await this.getAdditionalFields();
    return Object.fromEntries(Object.entries(fields).filter(([label, value]) => /Date$/.test(label) && value !== 'N/A'));
  }

  /** True when the modal offers a Close (✕) or a Cancel control. */
  async hasCloseControl(): Promise<boolean> {
    const hasCancelAndClose = await this.cancelAndCloseButton.isVisible().catch(() => false);
    const hasCancel = await this.cancelButton.isVisible().catch(() => false);
    Logger.log(`Cancel and close visible=${hasCancelAndClose}, Cancel visible=${hasCancel}`);
    return hasCancelAndClose || hasCancel;
  }

  async waitForDealDialogHidden(timeout = 10000): Promise<void> {
    await this.dealDialog.waitFor({ state: 'hidden', timeout }).catch(() => {});
  }

  /** Full text of the open deal modal — bid table rows, won/declined banners, Bid Details. */
  async getDealDialogText(): Promise<string> {
    return (await this.dealDialog.innerText()).replace(/\s+/g, ' ').trim();
  }

  async getAcceptBidButtonCount(): Promise<number> {
    return this.acceptBidButtons.count();
  }

  async getDeclineBidButtonCount(): Promise<number> {
    return this.declineBidButtons.count();
  }

  /**
   * A decided (Declined/Accepted) bid row keeps its Accept/Decline Bid buttons, rendered disabled (live-verified QA
   * 2026-10-09).
   */
  async isBidActionEnabled(action: InviteAction, index = 0): Promise<boolean> {
    const button = (action === 'Accept' ? this.acceptBidButtons : this.declineBidButtons).nth(index);
    return (await button.isVisible().catch(() => false)) && button.isEnabled();
  }

  /**
   * Like `openBidDecision`, but on the bid placed by `franchise` — the innermost element holding that name and the
   * button is its row.
   */
  async openBidDecisionFor(action: InviteAction, franchise: string): Promise<string> {
    const button = action === 'Accept' ? this.acceptBidButtons : this.declineBidButtons;
    await this.getBidRowButton(franchise, button).click();
    await this.bidDecisionDialog.waitFor({ state: 'visible', timeout: 15000 });
    return (await this.bidDecisionDialog.innerText()).replace(/\s+/g, ' ').trim();
  }

  async acceptBidAt(index = 0): Promise<void> {
    await this.acceptBidButtons.nth(index).click();
    await this.checkTermsOfUse();
    if (await this.confirmButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await this.confirmButton.click();
    }
    await this.waitForStabilization(2000);
  }

  async declineBidAt(index = 0): Promise<void> {
    await this.declineBidButtons.nth(index).click();
    const confirm = this.declineBidConfirmButton;
    if (await confirm.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirm.click();
    }
    await this.waitForStabilization(2000);
  }

  async getDealStatusText(): Promise<string> {
    const status = this.dealStatusBadge;
    return ((await status.textContent().catch(() => '')) || '').trim();
  }

  async getBidHistoryCount(): Promise<number> {
    if (!(await this.bidHistorySection.isVisible().catch(() => false))) return 0;
    await this.bidHistorySection.scrollIntoViewIfNeeded();
    return this.bidListRows.count();
  }

  async getPropertyInfoText(): Promise<string> {
    const section = this.propertyInfoSection;
    return ((await section.textContent().catch(() => '')) || '').trim();
  }
}

/**
 * What the deal modal must say for a bid under My Bids at Bid `stage`, for a bidder named `ownFranchise`:
 * In Review — an open bid (or a pending Direct Invite); Accepted — this franchise won; Lost — another
 * franchise won, or the bid was lost/declined.
 */
export function bidStagePattern(stage: 'In Review' | 'Accepted' | 'Lost', ownFranchise: string): RegExp {
  const own = escapeRegExp(ownFranchise);
  switch (stage) {
    case 'In Review':
      return /Current bid status:?\s*-?\s*In Review|INVITED/i;
    case 'Accepted':
      return new RegExp(`The winning franchise for this deal is: ${own}\\.`);
    case 'Lost':
      return new RegExp(
        `winning franchise for this deal is: (?!${own}\\.)|Current bid status:?\\s*-?\\s*(Bid )?(Lost|Declined)`,
        'i',
      );
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The listing franchise's bid-list row for a Direct Invite: "Direct Invite <invitee> … <status>". */
export function inviteeStatusPattern(invitee: string, status: string): RegExp {
  return new RegExp(`Direct Invite ${escapeRegExp(invitee)}.*${escapeRegExp(status)}`);
}

/** A "<label> <value>" pair in modal/popup text, allowing any whitespace between them. */
export function labelledValuePattern(label: string, value: string): RegExp {
  return new RegExp(`${escapeRegExp(label)}\\s*${escapeRegExp(value)}`);
}

/** The most a Reason for Bid may hold; one more character must be rejected. */
export const BID_REASON_MAX_LENGTH = 1000;

/** A Reason for Bid of exactly `length` characters. */
export function bidReasonOfLength(length: number): string {
  return 'y'.repeat(length);
}

/** "<franchise> … <status>" on one line of the bid list (e.g. "Infinity Homes … In Review"); any of `statuses`. */
export function franchiseStatusPattern(franchise: string, ...statuses: string[]): RegExp {
  return new RegExp(`${escapeRegExp(franchise)}.*(${statuses.map(escapeRegExp).join('|')})`);
}

/** The bidder's own "already (placed a) bid … with <bidder>" message. */
export function alreadyBidPattern(bidder: string): RegExp {
  return new RegExp(`already (placed a )?bid .*with ${escapeRegExp(bidder)}`, 'i');
}

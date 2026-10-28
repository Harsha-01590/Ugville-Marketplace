import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from '@shared/pages/base/BasePage';
import { Logger } from '@utils/logger';

/**
 * Component Page Object for Salesforce modal dialogs.
 * Handles duplicate opportunity dialogs, confirmation modals, etc.
 */
export class ModalComponent extends BasePage {
  /** "Continue" on the duplicate-opportunity dialog. */
  private readonly continueButton: Locator;
  private readonly cancelButton: Locator;
  private readonly closeButton: Locator;
  /** Any open SLDS modal / dialog. */
  private readonly modal: Locator;

  constructor(page: Page) {
    super(page);
    // No data-testid exists in this UI (Salesforce LWR site; confirmed via live inspection of QA on 2026-10-27,
    // shadow DOM included), so every locator below falls back to role/text/CSS.
    this.continueButton = page.locator('button:has-text("Continue")');
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
    this.closeButton = page.getByRole('button', { name: 'Close' });
    this.modal = page.locator('.slds-modal, [role="dialog"]').first();
  }

  /** Handle duplicate opportunity dialog if it appears */
  async handleDuplicateDialog(): Promise<void> {
    if ((await this.continueButton.count()) > 0) {
      Logger.info('Duplicate opportunity dialog detected. Clicking Continue...');
      await this.continueButton.click({ force: true });
      await this.page.waitForTimeout(2000);
    }
  }

  /**
   * Closes any stray SLDS modal left open on the page — e.g. the periodic
   * "Reminders" dialog Salesforce pops up unprompted. Run before every test
   * (see testFixtures.ts) on the shared worker-scoped `authedPage`, where a
   * modal opened by one test would otherwise block every test that runs
   * after it. See `BasePage.closeStrayModalIfOpen()` for the implementation —
   * also reused mid-test by `BasePage.clickDismissingStrayModal()` for modals
   * that appear after this pre-test check already ran.
   */
  async closeAnyOpenModal(): Promise<void> {
    await this.closeStrayModalIfOpen();
  }

  async clickCancel(): Promise<void> {
    await this.cancelButton.click({ force: true });
  }

  async clickClose(): Promise<void> {
    await this.closeButton.click({ force: true });
  }

  async expectModalVisible(): Promise<void> {
    await expect(this.modal).toBeVisible({ timeout: 10000 });
  }
}

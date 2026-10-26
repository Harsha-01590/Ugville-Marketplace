import { Page, expect } from '@playwright/test';
import { BasePage } from '../pages/base/BasePage';

/**
 * Component Page Object for Salesforce modal dialogs.
 * Handles duplicate opportunity dialogs, confirmation modals, etc.
 */
export class ModalComponent extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ==================== Locators ====================

  private get continueButton() {
    return this.page.locator('button:has-text("Continue")');
  }

  private get cancelButton() {
    return this.page.getByRole('button', { name: 'Cancel' });
  }

  private get closeButton() {
    return this.page.getByRole('button', { name: 'Close' });
  }

  // ==================== Actions ====================

  /** Handle duplicate opportunity dialog if it appears */
  async handleDuplicateDialog() {
    if ((await this.continueButton.count()) > 0) {
      console.log('Duplicate opportunity dialog detected. Clicking Continue...');
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

  async clickCancel() {
    await this.cancelButton.click({ force: true });
  }

  async clickClose() {
    await this.closeButton.click({ force: true });
  }

  // ==================== Assertions ====================

  async expectModalVisible() {
    await expect(
      this.page.locator('.slds-modal, [role="dialog"]').first(),
    ).toBeVisible({ timeout: 10000 });
  }
}

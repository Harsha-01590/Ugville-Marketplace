import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from '@shared/pages/base/BasePage';
import { Routes } from '@enums/routes.enum';
import { envConfig } from '@config/env.config';

/**
 * Page Object for the Ugville Login Page.
 * URL: /ugville/login
 *
 * Covers Step 1 of every flow: log in to Ugville before doing anything else.
 * `LoginPage` only knows how to fill the form and submit it — asserting what
 * happens *after* login (e.g. the dashboard loading) is `HomePage`'s job.
 */
export class LoginPage extends BasePage {
  /** Username/email input on the login form. */
  readonly usernameInput: Locator;
  /** Password input on the login form. */
  readonly passwordInput: Locator;
  /** Submit button — matches both "Log in" and "Login" button copy. */
  readonly loginButton: Locator;
  /** Error message shown for failed/invalid login attempts (wrong password, blank field, etc.). */
  readonly errorAlert: Locator;

  constructor(page: Page) {
    super(page);
    // No data-testid exists in this UI (Salesforce LWR site; confirmed via live inspection of QA on 2026-10-27,
    // shadow DOM included), so every locator below falls back to role/text/CSS.
    this.usernameInput = page.locator('input.slds-input[autocomplete="username"]');
    this.passwordInput = page.locator('input.slds-input[type="password"]');
    this.loginButton = page.locator('button:has-text("Log in"), button:has-text("Login")').first();
    this.errorAlert = page.getByRole('alert');
  }

  /** Go to the login page directly (used when not already there). */
  async navigate(): Promise<void> {
    await this.page.goto(Routes.LOGIN);
  }

  /** Fill in the given credentials and submit the login form. */
  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  /**
   * Navigate to the login page and sign in with the primary credentials for
   * the current environment (`UGVILLE_USERNAME` / `UGVILLE_PASSWORD` from
   * `.env.<ENV>`, same source the `authedPage` fixture uses). Use this in
   * tests that need to be logged in but aren't testing the login flow itself.
   */
  async loginAsDefaultUser(): Promise<void> {
    await this.navigate();
    await this.login(envConfig.UGVILLE_USERNAME.trim(), envConfig.UGVILLE_PASSWORD.trim());
  }

  /** Confirm the login form itself rendered — username, password, and submit button all visible. */
  async expectLoginPageVisible(): Promise<void> {
    await expect(this.usernameInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.loginButton).toBeVisible();
  }

  /** Confirm a login error is displayed (wrong password, blank field, etc.). */
  async expectErrorAlertVisible(): Promise<void> {
    await expect(this.errorAlert).toBeVisible();
  }
}

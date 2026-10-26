import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../../../shared/pages/base/BasePage';

/** Toggle rows on Profile > Settings (live-verified QA 2026-10-09). */
export type NotificationToggle = 'Notification Preference' | 'Marketplace Deal In' | 'Marketplace Deal Update';

/**
 * Profile > Settings — "UGVille Notification Preference" (a master toggle plus
 * Marketplace Deal In / Marketplace Deal Update) and "UGVille Marketplace Saved
 * Filter Notifications" (one row per saved filter with notifications on).
 *
 * Reached through the user menu: that link carries the user's ?recordId=,
 * while the bare /users/settings URL overlays an "Invalid Page" banner.
 * The switches have no accessible name, so each is found through its row.
 */
export class NotificationSettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get heading() {
    // .first(): seen QA 2026-10-11, the settings component rendered twice.
    return this.page.getByText('UGVille Notification Preference', { exact: true }).first();
  }

  private row(label: string): Locator {
    return this.page.locator('lightning-input').filter({ hasText: label }).first();
  }

  private toggle(label: string): Locator {
    return this.row(label).getByRole('switch');
  }

  /** Header avatar → user menu → Settings. */
  async openFromUserMenu() {
    await this.page.goto('/ugville/');
    await this.page.getByRole('banner').locator('img[alt]:not([alt="UGVille Logo"])').last().click();
    await this.page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
    await this.heading.waitFor({ state: 'visible', timeout: 30000 });
    await this.waitForStabilization(2000);
  }

  /** False when Settings says "You don't have a notification preference record" — no sub-toggles render then (QA 2026-10-21). */
  async hasPreferenceRecord(): Promise<boolean> {
    return !(await this.page.getByText(/don't have a notification preference record/i).first().isVisible().catch(() => false));
  }

  async isOn(label: NotificationToggle): Promise<boolean> {
    return this.toggle(label).isChecked();
  }

  async isToggleEnabled(label: NotificationToggle): Promise<boolean> {
    return this.toggle(label).isEnabled();
  }

  /**
   * Clicks the row's visible track (the real input is a 1×1 hidden box) and
   * verifies the new state sticks — a silent no-op here once left a user's
   * master toggle OFF after a test's restore step.
   */
  private async flip(row: Locator, on: boolean) {
    const sw = row.getByRole('switch');
    if ((await sw.isChecked()) === on) return;
    await row.locator('.slds-checkbox_faux').first().click();
    await expect(sw, `toggle should now be ${on ? 'ON' : 'OFF'}`).toBeChecked({ checked: on, timeout: 10000 });
    await this.waitForStabilization(1500);
  }

  async set(label: NotificationToggle, on: boolean) {
    await this.flip(this.row(label), on);
  }

  /** Names listed under "UGVille Marketplace Saved Filter Notifications" (first copy of the component only). */
  async getSavedFilterNotificationNames(): Promise<string[]> {
    const text = await this.page.locator('body').innerText();
    const start = text.indexOf('UGVille Marketplace Saved Filter Notifications');
    if (start < 0) return [];
    // Seen QA 2026-10-11: the component renders twice, so stop at the second copy's heading too.
    const ends = ['UGVille Notification Preference', 'Utility Bar'].map((s) => text.indexOf(s, start)).filter((i) => i >= 0);
    return text.slice(start, ends.length ? Math.min(...ends) : undefined).split('\n').slice(1)
      .map((l) => l.trim())
      .filter((l) => l && !['Marketplace filter Name', 'Active', 'Inactive', 'No saved marketplace filters are available.'].includes(l));
  }

  /** A saved filter's row — every such row shares the label "Marketplace filter Name", so it is found by position. */
  private savedFilterRow(index: number): Locator {
    return this.page.locator('lightning-input').filter({ hasText: 'Marketplace filter Name' }).nth(index);
  }

  private savedFilterToggle(index: number): Locator {
    return this.savedFilterRow(index).getByRole('switch');
  }

  async isSavedFilterOn(name: string): Promise<boolean> {
    return this.savedFilterToggle((await this.getSavedFilterNotificationNames()).indexOf(name)).isChecked();
  }

  async isSavedFilterToggleEnabled(name: string): Promise<boolean> {
    return this.savedFilterToggle((await this.getSavedFilterNotificationNames()).indexOf(name)).isEnabled();
  }

  async setSavedFilter(name: string, on: boolean) {
    await this.flip(this.savedFilterRow((await this.getSavedFilterNotificationNames()).indexOf(name)), on);
  }
}

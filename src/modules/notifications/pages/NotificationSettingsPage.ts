import { type Page, type Locator, type Request, expect } from '@playwright/test';
import { BasePage } from '@shared/pages/base/BasePage';

/** Notification categories on Profile, each with its own switch (live-verified QA 2026-10-28). */
export type NotificationCategory = 'Marketplace New Deals' | 'Marketplace Deals Update';

/** Delivery channels listed under each category, each with its own switch. */
export type NotificationChannel = 'Email' | 'SMS' | 'Mobile Push Notification' | 'UGVille Push Notification';

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
  'Email',
  'SMS',
  'Mobile Push Notification',
  'UGVille Push Notification',
];

/** A category's switch and its channels' switches, as read — for restoring them after a test. */
export interface CategoryState {
  on: boolean;
  channels: Record<NotificationChannel, boolean>;
}

/**
 * User menu > Profile — "UGVille Notification Preference" and "UGVille Marketplace
 * Saved Filter Notifications" (one row per saved filter, Active or Inactive).
 * Live-verified QA 2026-10-28: both moved here from Settings (which now holds only
 * Salesforce account settings); each category (Marketplace New Deals / Marketplace
 * Deals Update) has its own switch plus Email / SMS / Mobile Push / UGVille Push
 * channel switches, and there is no master toggle any more.
 *
 * Reached through the user menu: that link carries the user's ?recordId=.
 * The switches have no accessible name, so each is found through its row.
 */
export class NotificationSettingsPage extends BasePage {
  /** "UGVille Notification Preference" section heading. */
  private readonly heading: Locator;
  /** The header avatar that opens the user menu (any banner image except the logo). */
  private readonly userMenuAvatar: Locator;
  /** "Profile" entry in the user menu. */
  private readonly profileMenuItem: Locator;
  /** Message shown when the user has no notification preference record. */
  private readonly noPreferenceRecordMessage: Locator;
  /** The saved-filter notifications section, read as text to parse its filter names. */
  private readonly savedFilterSection: Locator;

  /** A category's group: its own switch row followed by its four channel rows. */
  readonly getCategoryGroup: (category: NotificationCategory) => Locator;
  readonly getCategoryRow: (category: NotificationCategory) => Locator;
  readonly getChannelRow: (category: NotificationCategory, channel: NotificationChannel) => Locator;
  /** A saved filter's row — every such row shares the label "Marketplace filter Name", so it is found by position. */
  readonly getSavedFilterRow: (index: number) => Locator;
  readonly getSavedFilterToggle: (index: number) => Locator;
  /** The visible track of a row's switch (the real input is a 1×1 hidden box). */
  readonly getSwitchTrack: (row: Locator) => Locator;
  /** A row's switch input. */
  readonly getRowSwitch: (row: Locator) => Locator;

  constructor(page: Page) {
    super(page);
    // No data-testid exists in this UI (Salesforce LWR site; confirmed via live inspection of QA on 2026-10-27,
    // shadow DOM included), so every locator below falls back to role/text/CSS.
    // .first(): seen QA 2026-10-11, the settings component rendered twice.
    this.heading = page.getByText('UGVille Notification Preference', { exact: true }).first();
    this.userMenuAvatar = page.getByRole('banner').locator('img[alt]:not([alt="UGVille Logo"])').last();
    this.profileMenuItem = page.getByRole('menuitem', { name: 'Profile', exact: true });
    this.noPreferenceRecordMessage = page.getByText(/don't have a notification preference record/i).first();
    // .last(): the outer page section also contains this heading; the innermost one holds only the filter rows.
    this.savedFilterSection = page
      .locator('section')
      .filter({ hasText: 'UGVille Marketplace Saved Filter Notifications' })
      .last();
    // Both categories share one .pref-card; each sits in its own child div, and channel rows carry .mnd-sub-row.
    this.getCategoryGroup = (category) => page.locator('div.pref-card > div').filter({ hasText: category }).first();
    this.getCategoryRow = (category) => this.getCategoryGroup(category).locator('div.toggle-row:not(.mnd-sub-row)');
    this.getChannelRow = (category, channel) =>
      this.getCategoryGroup(category).locator('div.toggle-row.mnd-sub-row').filter({ hasText: channel });
    this.getSavedFilterRow = (index) =>
      page.locator('lightning-input').filter({ hasText: 'Marketplace filter Name' }).nth(index);
    this.getSavedFilterToggle = (index) => this.getSavedFilterRow(index).getByRole('switch');
    this.getSwitchTrack = (row) => row.locator('.slds-checkbox_faux').first();
    this.getRowSwitch = (row) => row.getByRole('switch');
  }

  /** Header avatar → user menu → Profile, where the notification preferences live. */
  async openFromUserMenu(): Promise<void> {
    await this.page.goto('/ugville/');
    await this.userMenuAvatar.click();
    await this.profileMenuItem.click();
    await this.heading.waitFor({ state: 'visible', timeout: 30000 });
    await this.waitForStabilization(2000);
  }

  /**
   * False when the page says "You don't have a notification preference record" — no category switches render then
   * (QA 2026-10-21).
   */
  async hasPreferenceRecord(): Promise<boolean> {
    return !(await this.noPreferenceRecordMessage.isVisible().catch(() => false));
  }

  async isCategoryOn(category: NotificationCategory): Promise<boolean> {
    return this.getRowSwitch(this.getCategoryRow(category)).isChecked();
  }

  async isChannelOn(category: NotificationCategory, channel: NotificationChannel): Promise<boolean> {
    return this.getRowSwitch(this.getChannelRow(category, channel)).isChecked();
  }

  async isChannelEnabled(category: NotificationCategory, channel: NotificationChannel): Promise<boolean> {
    return this.getRowSwitch(this.getChannelRow(category, channel)).isEnabled();
  }

  /** Live-verified QA 2026-10-28: OFF turns every channel off and disables it; ON turns every channel back on. */
  async setCategory(category: NotificationCategory, on: boolean): Promise<void> {
    await this.flip(this.getCategoryRow(category), on);
  }

  async setChannel(category: NotificationCategory, channel: NotificationChannel, on: boolean): Promise<void> {
    await this.flip(this.getChannelRow(category, channel), on);
  }

  async getCategoryState(category: NotificationCategory): Promise<CategoryState> {
    const channels = {} as Record<NotificationChannel, boolean>;
    for (const channel of NOTIFICATION_CHANNELS) channels[channel] = await this.isChannelOn(category, channel);
    return { on: await this.isCategoryOn(category), channels };
  }

  /**
   * Puts a category back as `state` recorded it. Turning a category ON switches every channel on, so the
   * channels are then set one by one.
   */
  async restoreCategory(category: NotificationCategory, state: CategoryState): Promise<void> {
    await this.setCategory(category, state.on);
    if (!state.on) return;
    for (const channel of NOTIFICATION_CHANNELS) await this.setChannel(category, channel, state.channels[channel]);
  }

  /**
   * Clicks the row's visible track (the real input is a 1×1 hidden box) and waits for the save call.
   * Seen QA 2026-10-28: a click soon after Profile loads can move the switch on screen without saving it
   * (the row reverts on reload), so when no save goes out the page is reloaded and the click retried.
   */
  async flip(row: Locator, on: boolean): Promise<void> {
    const sw = this.getRowSwitch(row);
    for (let attempt = 1; ; attempt++) {
      if ((await sw.isChecked()) === on) return;
      const saved = this.page.waitForRequest(isPreferenceSave, { timeout: 10000 }).then(
        () => true,
        () => false,
      );
      await this.getSwitchTrack(row).click();
      await expect(sw, `toggle should now be ${on ? 'ON' : 'OFF'}`).toBeChecked({ checked: on, timeout: 10000 });
      if (await saved) break;
      if (attempt === 3) throw new Error(`Toggling ${on ? 'ON' : 'OFF'} sent no save request in 3 tries`);
      await this.page.reload();
      await this.heading.waitFor({ state: 'visible', timeout: 30000 });
      await this.waitForStabilization(2000);
    }
    await this.waitForStabilization(1500);
  }

  /** Names listed under "UGVille Marketplace Saved Filter Notifications". */
  async getSavedFilterNotificationNames(): Promise<string[]> {
    if (!(await this.savedFilterSection.isVisible().catch(() => false))) return [];
    return (await this.savedFilterSection.innerText())
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter(
        (l) =>
          l &&
          !['Marketplace filter Name', 'Active', 'Inactive', 'No saved marketplace filters are available.'].includes(l),
      );
  }

  async isSavedFilterOn(name: string): Promise<boolean> {
    return this.getSavedFilterToggle((await this.getSavedFilterNotificationNames()).indexOf(name)).isChecked();
  }

  async isSavedFilterToggleEnabled(name: string): Promise<boolean> {
    return this.getSavedFilterToggle((await this.getSavedFilterNotificationNames()).indexOf(name)).isEnabled();
  }

  async setSavedFilter(name: string, on: boolean): Promise<void> {
    await this.flip(this.getSavedFilterRow((await this.getSavedFilterNotificationNames()).indexOf(name)), on);
  }

  /** Saved filter names listed in Settings, sorted — for comparing with another list regardless of order. */
  async getSortedSavedFilterNotificationNames(): Promise<string[]> {
    return (await this.getSavedFilterNotificationNames()).sort();
  }

  /** Saved filters whose row is Active (switch on), sorted. */
  async getActiveSavedFilterNames(): Promise<string[]> {
    const names = await this.getSavedFilterNotificationNames();
    const active: string[] = [];
    for (const [i, name] of names.entries()) if (await this.getSavedFilterToggle(i).isChecked()) active.push(name);
    return active.sort();
  }

  /** The first saved filter whose row is Active ('' when none is). */
  async getFirstSavedFilterNotificationName(): Promise<string> {
    return (await this.getActiveSavedFilterNames())[0] ?? '';
  }

  /** Sets saved filter `name`'s row to `on`, if Settings still lists it. */
  async setSavedFilterIfListed(name: string, on: boolean): Promise<void> {
    if ((await this.getSavedFilterNotificationNames()).includes(name)) await this.setSavedFilter(name, on);
  }

  /**
   * Starts capturing the decoded bodies of this page's non-GET requests that mention notifications or
   * filters — the preference updates Settings sends. Call `stop()` to stop capturing.
   */
  startCapturingPreferenceRequests(): PreferenceRequestCapture {
    const bodies: string[] = [];
    const record = (request: Request): void => {
      if (request.method() === 'GET') return;
      const body = decodeURIComponent((request.postData() || '').replace(/\+/g, ' '));
      if (/otification|Filter/i.test(body)) bodies.push(body);
    };
    this.page.on('request', record);
    return { bodies, stop: () => this.page.off('request', record) };
  }
}

/** The Apex calls Profile makes to save a saved filter's or a category's switch. */
function isPreferenceSave(request: Request): boolean {
  return request.method() === 'POST' && /updateMarketplaceFilter|saveNotificationPreference/.test(request.postData() ?? '');
}

/** Request bodies captured by `startCapturingPreferenceRequests()`, and the function that stops capturing. */
export interface PreferenceRequestCapture {
  bodies: string[];
  stop: () => void;
}

/** The first captured update that turns something off (its body carries `false`), or '' when none did. */
export function firstDisablingUpdate(bodies: string[]): string {
  return bodies.find((b) => /false/.test(b)) ?? '';
}

/** The captured bodies, each cut to 400 characters, for the run log. */
export function describeCapturedRequests(bodies: string[]): string {
  return JSON.stringify(bodies.map((b) => b.slice(0, 400)));
}

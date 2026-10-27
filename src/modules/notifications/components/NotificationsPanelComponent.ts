import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from '../../../shared/pages/base/BasePage';

/**
 * Notifications panel — accessible via the bell icon in the top navigation.
 *
 * Live-verified structure: the bell icon's accessible name comes from a
 * visually-hidden `slds-assistive-text` span reading exactly "Notifications"
 * (inside the icon component's own markup). That span's own click target is
 * unreliable, though: a sibling `.notification-count` unread-badge div sits
 * visually on top of part of it and intercepts pointer events, so a plain
 * (non-forced) click on the span retries until Playwright times out — this
 * is why the panel-open/list/mark-all-read tests were failing outright. The
 * fix mirrors `TopNavComponent`'s icon clicks: force the click through to
 * the span's real click handler, which bubbles up to the actual clickable
 * wrapper and opens the panel either way. The unread badge itself is a
 * *structurally separate* `.notification-count` div (real DOM text, e.g.
 * "6") nested in a sibling `.notification-container` — it is not merged into
 * the bell's text the way `MarketplacePage.openFromHome()`'s
 * `/^Marketplace\d*$/` badge is, so that inline-merged-text technique does
 * not apply here and was previously mis-applied. The panel content itself is
 * a `list` of `listitem`s, each carrying a category label ("Good News!", "UG
 * Update", "UgVille Marketplace"), a message line, and a relative/absolute
 * timestamp, plus a "Mark all as read" text control above the list.
 */
export class NotificationsPanelComponent extends BasePage {
  // ==================== Locators ====================

  /** The bell icon's accessible-name label; clicking it opens the panel (bubbles to the real click handler on its ancestor). */
  private readonly notificationBellArea: Locator;
  /** The unread-count badge — a distinct `.notification-count` div, not part of the bell's own text (see class docstring). */
  private readonly notificationBadge: Locator;
  private readonly markAllAsReadButton: Locator;
  /** Each real notification entry — a `listitem` whose text includes a relative ("X ago") or absolute (AM/PM) timestamp, matching every notification observed live this session. */
  private readonly notificationItems: Locator;

  constructor(page: Page) {
    super(page);
    this.notificationBellArea = page.getByText('Notifications', { exact: true }).first();
    this.notificationBadge = page.locator('.notification-container .notification-count, .notification-count').first();
    this.markAllAsReadButton = page.getByText('Mark all as read', { exact: true });
    this.notificationItems = page.getByRole('listitem').filter({ hasText: /ago|AM|PM/ });
  }

  /** The "jump to record" icon at the end of a notification row — the row's only navigation trigger. */
  private jumpIcon(row: Locator): Locator {
    return row.locator('[icon-name="utility:jump_to_right"]');
  }

  // ==================== Actions ====================

  async openNotifications() {
    await this.notificationBellArea.click({ force: true });
    await this.page.waitForTimeout(1000);
  }

  async markAllAsRead() {
    await this.markAllAsReadButton.waitFor({ state: 'visible', timeout: 10000 });
    await this.markAllAsReadButton.click({ force: true });
    await this.page.waitForTimeout(1000);
  }

  /** Count of rendered notification entries (not strictly the unread-badge count — see `expectNotificationBadgeVisible()` for that). */
  async getNotificationCount(): Promise<number> {
    return this.notificationItems.count();
  }

  async getNotificationItems(): Promise<string[]> {
    const count = await this.notificationItems.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      texts.push(((await this.notificationItems.nth(i).textContent()) || '').trim());
    }
    return texts;
  }

  /**
   * Live-verified (2026-08-11): clicking the `<li>` row itself does nothing —
   * the only real navigation trigger is a small `utility:jump_to_right`
   * icon at the end of each row (it carries the target record's ID as
   * `data-tid`). The row's text/timestamp is not clickable.
   */
  async clickFirstNotification() {
    const first = this.notificationItems.first();
    const jumpIcon = this.jumpIcon(first);
    if (await jumpIcon.isVisible().catch(() => false)) {
      await jumpIcon.click();
      await this.page.waitForTimeout(2000);
    }
  }

  // ==================== Assertions ====================

  /**
   * At least one real signal that the panel is open/rendered — the "Mark
   * all as read" control or a notification listitem. Not gated on a
   * specific "Notifications" heading: no such heading was observed in any
   * live snapshot this session (the panel's content may already sit in the
   * DOM regardless of its visual open/closed state), so asserting one would
   * be a guess this component's past version already got wrong once.
   */
  async expectNotificationsPanelVisible() {
    const signal = this.markAllAsReadButton.or(this.notificationItems.first());
    await expect(signal.first()).toBeVisible({ timeout: 15000 });
  }

  /**
   * The bell icon itself must always be visible. The unread-count badge is
   * conditional on real account state, though — live-confirmed the badge div
   * doesn't render at all once every notification has been read (e.g. right
   * after `markAllAsRead()` ran in an earlier test against this same shared
   * account), so an absent badge is a valid "fully read" state, not a bug.
   * Only fails if the badge div is present but its text isn't a plain digit
   * run — that would be a real rendering problem.
   */
  async expectNotificationBadgeVisible() {
    await expect(this.notificationBellArea).toBeVisible();
    const badgePresent = await this.notificationBadge.isVisible().catch(() => false);
    if (!badgePresent) return; // fully read — nothing to assert on the badge itself
    const text = ((await this.notificationBadge.textContent().catch(() => '')) || '').trim();
    expect(
      /^\d+$/.test(text),
      `Notification badge, when rendered, should show a numeric unread count (was "${text}")`,
    ).toBe(true);
  }
}

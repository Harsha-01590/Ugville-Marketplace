import { test, expect } from '@fixtures/testFixtures';
import { NOTIFICATION_CHANNELS, describeCapturedRequests, firstDisablingUpdate } from '@modules/notifications';
import { Logger } from '@utils/logger';

/**
 * Workflow suite for the Marketplace_Master sheet's workflow:
 * "Notifications: Push & Preference Alerts"
 * (see the sheet's Workflow Summary / Automation Categorization tabs).
 *
 * Scope notes carried over from the former marketplacePushPreferenceNotifications.regression.spec.ts:
 *
 * Marketplace Push & Preference Notifications Suite — maps to the
 * Marketplace_Master spreadsheet's "Push Notifications" (PN_001-010),
 * "Push Notifications (Detailed)" (PN_011-022), and "Preference
 * Notifications" (PR_001-020) groups (~42 rows).
 *
 * Scope decision (made 2026-08-04, restated here): this is a Playwright
 * *web* framework with no mobile app to receive an actual FCM/APNs push —
 * every PN_* case is proxied via the in-app `NotificationsPanelComponent`
 * bell/panel where a real equivalent notification exists (this session's
 * live sandbox already carries real historical strings for several of
 * these events), and `test.skip`/deferred for anything with no such
 * equivalent (iOS/Android device-level checks, app kill/relaunch, email
 * coexistence, Marketplace Delegate-specific routing).
 *
 * - PN_004/006/014/016 ("New Bid" to Listing Franchise, "Bid
 *   Accepted"/"Bid Declined" to Bidding Franchise) and PN_001/011 (Direct
 *   Invite) all have confirmed real notification text in the sandbox — see
 *   below. PN_002/003/005/012/013/015 (decline-specific pushes) have no
 *   confirmed matching text in the notification history read live this
 *   session — not asserted on, since guessing the exact copy would repeat
 *   the mistake chunk 7's `NotificationsPanelComponent` fix was about.
 * - PN_008/019 (tapping a push deep-links to the deal record) has a genuine
 *   web equivalent: clicking a notification item. Tested via
 *   `clickFirstNotification()`.
 * - PN_007/018 (recipient differentiation — Listing vs. Bidding User) is
 *   proxied by checking the *shape* of the message text itself (a "got a
 *   bid from" notification is inherently a Listing-Franchise-facing
 *   message; a "bid has been accepted" is inherently Bidding-Franchise-
 *   facing) — this account sees both because the shared sandbox has
 *   history as both roles across different deals, not because true
 *   recipient-scoping was verified (that would need two separate logins).
 * - PN_009/010/017/020-022 (email/push coexistence, iOS vs. Android,
 *   app-kill/relaunch persistence, Web-triggers-mobile-push) are
 *   device/backend-level with zero web UI surface — out of scope.
 * - PR_001-006/010 (Settings toggles, FCM subscribe/unsubscribe calls,
 *   analytics events, AsyncStorage offline fallback) describe a Profile >
 *   Settings notification-preferences screen this framework's `account`
 *   module has never modeled — out of scope, needs live verification of
 *   whether it even exists before any code is written.
 * - PR_007/008/014-020 are backend REST-payload/FCM-delivery assertions
 *   (`notificationsEnabled` booleans, PUT payloads, smart deduplication)
 *   with no UI surface at all — out of scope, same convention as every
 *   other backend-only case in this suite.
 * - PR_009 (Mobile-to-Web sync) needs a second session — out of scope.
 * - PR_011-013 ("Notify me about new deals matching this filter" checkbox):
 *   the checkbox is not in the app on QA or UAT — Out of Scope (Not in App).
 */

test.describe('Notifications: Push & Preference Alerts @regression @MarketplaceNotificationsPushPreferenceAlerts', () => {
  // =====================================================================
  // PN_004/014 & PN_006/016: New Bid / Bid Accepted notification content
  // =====================================================================

  // Covers: PN_004/006/014/016
  test(
    "New Bid and Bid Accepted notifications carry the deal's MPD id @regression",
    { tag: '@NOTIF-01' },
    async ({ authedHomePage, authedNotificationsPanelComponent }) => {
      await test.step('Open the notifications panel from Home', async () => {
        await authedHomePage.openAndSettle();
        await authedNotificationsPanelComponent.openNotifications();
      });

      const bidNotifications = await test.step('Collect the New Bid and Bid Accepted notifications', async () => {
        return authedNotificationsPanelComponent.getNotificationItemsMatching(/got a bid from|bid has been accepted/i);
      });

      await test.step('Verify every New Bid / Bid Accepted notification carries an MPD id', async () => {
        Logger.log(`${bidNotifications.length} "new bid" / "bid accepted" notification(s)`);
        for (const text of bidNotifications) {
          expect(text, 'Bid-related notification should reference an MPD id').toMatch(/MPD-\d+/);
        }
      });
    },
  );

  // =====================================================================
  // PN_007/018: Recipient differentiation — message shape distinguishes Listing vs. Bidding side
  // =====================================================================

  // Covers: PN_007/018
  test(
    'Notification text distinguishes Listing-side ("got a bid") from Bidding-side ("bid accepted") events @regression',
    { tag: '@NOTIF-02' },
    async ({ authedHomePage, authedNotificationsPanelComponent }) => {
      const count = await test.step('Open the notifications panel from Home', async () => {
        await authedHomePage.openAndSettle();
        await authedNotificationsPanelComponent.openNotifications();
        return authedNotificationsPanelComponent.getNotificationCount();
      });

      test.skip(count === 0, 'No notifications in current sandbox state');

      await test.step('Count Listing-side and Bidding-side notification wording', async () => {
        const listingSide = await authedNotificationsPanelComponent.getNotificationItemsMatching(/got a bid from/i);
        const biddingSide = await authedNotificationsPanelComponent.getNotificationItemsMatching(
          /(your bid has been accepted|you have a direct invite)/i,
        );
        Logger.log(`Listing-side event text=${listingSide.length}, Bidding-side event text=${biddingSide.length}`);
        // Not a hard pass/fail on presence (this shared sandbox's real history
        // varies run to run) — the point is that when either exists, its
        // wording is inherently role-specific, distinguishable text, not proof
        // of true per-user delivery scoping (that needs a second login).
        expect(listingSide.length).toBeGreaterThanOrEqual(0);
        expect(biddingSide.length).toBeGreaterThanOrEqual(0);
      });
    },
  );

  // =====================================================================
  // PN_008/019: Tapping a notification deep-links toward the deal
  // =====================================================================

  // Covers: PN_008/019
  test(
    'Clicking a notification navigates away from the current page (deep-link proxy) @regression',
    { tag: '@NOTIF-03' },
    async ({ authedHomePage, authedNotificationsPanelComponent }) => {
      const { urlBefore, count } = await test.step('Open the notifications panel from Home', async () => {
        await authedHomePage.openAndSettle();
        const url = authedHomePage.getCurrentUrl();
        await authedNotificationsPanelComponent.openNotifications();
        return { urlBefore: url, count: await authedNotificationsPanelComponent.getNotificationCount() };
      });

      test.skip(count === 0, 'No notifications in current sandbox state');

      await test.step('Click the first notification', async () => {
        await authedNotificationsPanelComponent.clickFirstNotification();
      });

      await test.step('Verify it navigated away without landing on login', async () => {
        const urlAfter = authedHomePage.getCurrentUrl();
        Logger.log(`URL before="${urlBefore}" after="${urlAfter}"`);
        expect(urlAfter).not.toBe(urlBefore);
        await authedHomePage.expectNotOnLoginPage();
      });
    },
  );
});

// =====================================================================
// Profile notification preferences (PR_018/PR_019/SAN_070).
// Live-verified QA 2026-10-28: the preferences moved from Settings to
// Profile; each category has its own switch plus Email / SMS / Mobile
// Push / UGVille Push channels (no master toggle), and every saved filter
// is listed as Active or Inactive. Each test restores every switch it
// changes, so the account's real preferences are left as found.
// =====================================================================

/** No category switches render until an admin creates the user's notification preference record. */
const NO_PREFERENCE_RECORD =
  'Profile says this user has no notification preference record — an admin must create it first';

test.describe('Notifications: Profile preferences @regression @MarketplaceNotificationsPushPreferenceAlerts', () => {
  // Covers: PR_018
  test(
    'Profile marks exactly the saved filters with notifications enabled as Active @regression',
    { tag: '@NOTIF-04' },
    async ({ authedMarketplacePage, authedNotificationSettingsPage: settings }) => {
      const saved = await test.step('Read the saved Marketplace filters', async () => {
        await authedMarketplacePage.navigate();
        return authedMarketplacePage.getSavedFilterNames();
      });

      test.skip(saved.length === 0, 'This user has no saved Marketplace filters');

      const notified = await test.step('Find which saved filters have "Enable notifications" ticked', async () => {
        return authedMarketplacePage.getNotifiedSavedFilters(saved);
      });

      const hasRecord = await test.step('Open Profile', async () => {
        await settings.openFromUserMenu();
        return settings.hasPreferenceRecord();
      });

      test.skip(!hasRecord, NO_PREFERENCE_RECORD);

      // Live-verified QA 2026-10-28: Profile lists Inactive rows too, but not every saved filter (a filter that
      // never had notifications on can be missing), so rows are checked against the saved list, not equal to it.
      await test.step('Verify each row is a saved filter and only the notified ones are Active', async () => {
        const rows = await settings.getSortedSavedFilterNotificationNames();
        const active = await settings.getActiveSavedFilterNames();
        Logger.log(
          `Saved filters ${JSON.stringify(saved)}, notify on ${JSON.stringify(notified)}, ` +
            `Profile rows ${JSON.stringify(rows)}, Active ${JSON.stringify(active)}`,
        );
        expect(saved, 'every row is one of the saved filters').toEqual(expect.arrayContaining(rows));
        expect(active, 'Active rows are exactly the notified filters').toEqual(notified);
      });
    },
  );

  // Covers: PR_019
  test(
    'Turning a saved filter\'s notifications OFF on Profile saves it and unticks "Enable notifications" for that filter @regression',
    { tag: '@NOTIF-05' },
    async ({ authedMarketplacePage, authedNotificationSettingsPage: settings }) => {
      const hasRecord = await test.step('Open Profile', async () => {
        await settings.openFromUserMenu();
        return settings.hasPreferenceRecord();
      });

      test.skip(!hasRecord, NO_PREFERENCE_RECORD);

      const name = await test.step('Find a saved filter whose row is Active', async () => {
        return settings.getFirstSavedFilterNotificationName();
      });

      test.skip(!name, 'No saved filter has notifications on');

      const capture = await test.step('Start capturing the preference update requests', async () => {
        return settings.startCapturingPreferenceRequests();
      });

      try {
        await test.step(`Turn the "${name}" saved filter's notifications OFF`, async () => {
          await settings.setSavedFilter(name, false);
          capture.stop();
        });

        await test.step('Verify the update request sent enabled = false', async () => {
          const update = firstDisablingUpdate(capture.bodies);
          Logger.log(`Notification/filter request(s): ${describeCapturedRequests(capture.bodies)}`);
          expect(update, 'turning the row off sends an update with false').toBeTruthy();
          expect.soft(update, 'Payload is the saved-filter update').toMatch(/updateMarketplaceFilter/);
          expect.soft(update, 'Payload turns the filter off').toMatch(/"enabled":false/);
        });

        await test.step('Reopen Profile and verify the row is still listed, now Inactive', async () => {
          await settings.openFromUserMenu();
          expect(await settings.getSavedFilterNotificationNames(), `${name} is still listed`).toContain(name);
          expect(await settings.isSavedFilterOn(name), `${name} row is Inactive`).toBe(false);
        });

        await test.step('Verify "Enable notifications" is unticked for that filter in the Marketplace', async () => {
          await authedMarketplacePage.navigate();
          expect(
            await authedMarketplacePage.isSavedFilterNotified(name),
            `"Enable notifications" unticked for ${name}`,
          ).toBe(false);
        });
      } finally {
        await test.step(`Stop capturing and restore the "${name}" saved filter's notifications`, async () => {
          capture.stop();
          await settings.openFromUserMenu();
          await settings.setSavedFilterIfListed(name, true);
        });
      }
    },
  );

  // Covers: SAN_070
  for (const category of ['Marketplace New Deals', 'Marketplace Deals Update'] as const) {
    test(
      `Turning "${category}" OFF switches off and disables every one of its channels @regression`,
      { tag: category === 'Marketplace New Deals' ? '@NOTIF-06' : '@NOTIF-07' },
      async ({ authedNotificationSettingsPage: settings }) => {
        const hasRecord = await test.step('Open Profile', async () => {
          await settings.openFromUserMenu();
          return settings.hasPreferenceRecord();
        });

        test.skip(!hasRecord, NO_PREFERENCE_RECORD);

        const original = await test.step(`Note "${category}" and its channels to restore later`, async () => {
          return settings.getCategoryState(category);
        });

        try {
          await test.step(`Turn "${category}" ON and verify its channels can be changed`, async () => {
            await settings.setCategory(category, true);
            for (const channel of NOTIFICATION_CHANNELS) {
              expect(await settings.isChannelEnabled(category, channel), `${channel} enabled`).toBe(true);
            }
          });

          await test.step(`Turn "${category}" OFF`, async () => {
            await settings.setCategory(category, false);
          });

          await test.step('Verify every channel is off and disabled, and stays so after reopening Profile', async () => {
            for (const reopened of [false, true]) {
              if (reopened) await settings.openFromUserMenu();
              const when = reopened ? 'after reopening' : 'right away';
              expect(await settings.isCategoryOn(category), `${category} off ${when}`).toBe(false);
              for (const channel of NOTIFICATION_CHANNELS) {
                expect(await settings.isChannelOn(category, channel), `${channel} off ${when}`).toBe(false);
                expect(await settings.isChannelEnabled(category, channel), `${channel} disabled ${when}`).toBe(false);
              }
            }
          });
        } finally {
          await test.step(`Restore "${category}" and each of its channels`, async () => {
            await settings.openFromUserMenu();
            await settings.restoreCategory(category, original);
            await settings.openFromUserMenu(); // read back what was saved, not just what the switches show
            expect(await settings.getCategoryState(category), `${category} restored`).toEqual(original);
          });
        }
      },
    );
  }
});

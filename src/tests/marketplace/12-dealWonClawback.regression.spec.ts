import { test, expect } from '@fixtures/testFixtures';
import { Logger } from '@utils/logger';

/**
 * Workflow suite for the Marketplace_Master sheet's workflow:
 * "Deal Won & Clawback"
 * (see the sheet's Workflow Summary / Automation Categorization tabs).
 *
 * Some tests here moved from the former marketplaceDealLifecycle.regression.spec.ts — its
 * scope notes now live in 07-directInviteFlow.regression.spec.ts.
 */

test.describe('Deal Won & Clawback @regression @MarketplaceDealWonClawback', () => {
  // =====================================================================
  // Deal Won - Clawback (notifications proxy)
  // =====================================================================

  test(
    "Clawback notifications carry the deal's MPD id (proxy for inactivity clawback) @regression",
    { tag: '@CLAWBACK-01' },
    async ({ authedHomePage, authedNotificationsPanelComponent }) => {
      await test.step('Open the notifications panel from Home', async () => {
        await authedHomePage.openAndSettle();
        await authedNotificationsPanelComponent.openNotifications();
      });

      const clawbacks = await test.step('Collect the notifications that report a clawback', async () => {
        return authedNotificationsPanelComponent.getNotificationItemsMatching(/clawed back/i);
      });

      await test.step('Verify every clawback notification carries an MPD id', async () => {
        Logger.log(`Clawback: ${clawbacks.length} notification(s) reference a clawback`);
        for (const text of clawbacks) {
          expect(text, 'Clawback notification should reference an MPD id').toMatch(/MPD-\d+/);
        }
      });
    },
  );
});

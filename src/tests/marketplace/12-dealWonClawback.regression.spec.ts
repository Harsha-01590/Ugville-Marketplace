import { test, expect } from '../../fixtures/testFixtures';
import type { Page } from '@playwright/test';
import type { HomePage } from '../../modules/dashboard';
import type { TestData } from '../../fixtures/testFixtures';

/**
 * Workflow suite for the Marketplace_Master sheet's workflow:
 * "Deal Won & Clawback"
 * (see the sheet's Workflow Summary / Automation Categorization tabs).
 *
 * Some tests here moved from the former marketplaceDealLifecycle.regression.spec.ts — its
 * scope notes now live in 07-directInviteFlow.regression.spec.ts.
 */

async function resetToHome(authedPage: Page, authedHomePage: HomePage, data: TestData) {
  await authedHomePage.navigate();
  await authedPage.waitForLoadState('domcontentloaded');
  await authedPage.waitForTimeout(data.timeouts.settle);
}

async function settleAfter(authedPage: Page, data: TestData) {
  await authedPage.waitForTimeout(data.timeouts.afterEach);
}

test.describe('Deal Won & Clawback @regression @MarketplaceDealWonClawback', () => {
  // =====================================================================
  // Deal Won - Clawback (notifications proxy)
  // =====================================================================

  test('Clawback notifications carry the deal\'s MPD id (proxy for inactivity clawback) @regression', { tag: '@CLAWBACK-01' }, async ({
    authedPage, data, authedHomePage, authedNotificationsPanelComponent,
  }) => {
    await resetToHome(authedPage, authedHomePage, data);
    await authedNotificationsPanelComponent.openNotifications();
    const items = await authedNotificationsPanelComponent.getNotificationItems();
    const clawbacks = items.filter((t) => /clawed back/i.test(t));
    console.log(`Clawback: ${clawbacks.length} of ${items.length} notification(s) reference a clawback`);
    for (const text of clawbacks) {
      expect(text, 'Clawback notification should reference an MPD id').toMatch(/MPD-\d+/);
    }
    await settleAfter(authedPage, data);
  });
});

import type { Page, Route } from '@playwright/test';

/**
 * Simulates a backend failure for the sheet's "API fails" cases (MSG_007-009):
 * every Apex call from `page` whose method name matches `method` gets an HTTP
 * 500 instead of reaching Salesforce. The site is an LWR site — Apex runs
 * through POST /webruntime/api/apex/execute with {"classname","method",...}
 * in the body (live-verified QA 2026-10-09: getMarketplaceRecord, getAllBids,
 * existingBidFranchise, EligibleForWithdrawDeal when a deal opens).
 * Returns the method names it failed, and a function that removes the route.
 */
export async function failApexMethod(page: Page, method: RegExp) {
  const failed: string[] = [];
  const handler = async (route: Route) => {
    let name = '';
    try {
      name = JSON.parse(route.request().postData() || '{}').method ?? '';
    } catch {
      // not JSON — let it through
    }
    if (!method.test(name)) return route.fallback();
    failed.push(name);
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Simulated failure', exceptionType: 'System.CalloutException' }),
    });
  };
  const url = '**/webruntime/api/apex/execute**';
  await page.route(url, handler);
  return { failed, restore: () => page.unroute(url, handler) };
}

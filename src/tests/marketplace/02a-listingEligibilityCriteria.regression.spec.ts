import { test, expect } from '../../fixtures/testFixtures';
import { envConfig } from '../../config/env.config';

/**
 * Listing eligibility criteria that live in Salesforce: Good Standing,
 * Advertising and DQI (>= 70). This suite can't read or change Salesforce, so
 * MP_FAILING_CRITERIA (.env.<ENV>, or on the command line) says which
 * criteria Franchise A currently fails:
 *
 *   MP_FAILING_CRITERIA=                               all pass: listing opens the deal form
 *   MP_FAILING_CRITERIA=dqi                            only DQI fails
 *   MP_FAILING_CRITERIA=goodStanding,advertising,dqi   all three fail
 *
 * The test lists a fresh seller op and checks the app shows exactly the
 * errors for those criteria, no others, and none of the retired messages.
 * When every criterion passes it opens the deal form and cancels, so nothing
 * is listed. Run on its own with:  npm run test:eligibility
 *
 * Every other listing/bidding suite needs Franchise A eligible, so run those
 * only when MP_FAILING_CRITERIA is blank.
 */

const MESSAGES = {
  // App text, QA 2026-10-12 ("in unavailable" is the app's own typo).
  goodStanding: 'Marketplace access in unavailable. Please contact support.',
  advertising: 'Marketplace access unavailable. Your franchise(s) is not actively advertising in the primary ad council.',
  dqi: 'Marketplace access unavailable. The DQI score of at least one franchise must be above 70 to use.',
} as const;
type Criterion = keyof typeof MESSAGES;
const CRITERIA = Object.keys(MESSAGES) as Criterion[];

/** Wording the app used before the eligibility messages were updated. */
const RETIRED_MESSAGES = ['Account DQI is less than eligible range', 'Account On Showstoppers is true', 'Account is not actively advertising'];

const failing = envConfig.MP_FAILING_CRITERIA.split(',').map((c) => c.trim()).filter(Boolean);

test.describe('Listing Eligibility Criteria @regression @ListingEligibilityCriteria', () => {
  // Covers: SAN_009, SAN_010, SAN_011, EM_012, EM_013, EM_014, UE_001, UE_002, UE_003, UE_004, UE_005, ME_001, ME_004, ME_005
  test(`Listing follows the eligibility criteria failing in Salesforce (${failing.join(', ') || 'none'}) @regression`, { tag: '@CRIT-01' }, async ({
    authedHomePage, authedSellerLeadPage,
  }) => {
    test.setTimeout(300_000);
    expect(failing.filter((c) => !CRITERIA.includes(c as Criterion)), `MP_FAILING_CRITERIA may only list: ${CRITERIA.join(', ')}`).toEqual([]);
    await authedSellerLeadPage.createFromHome(authedHomePage, envConfig.FRANCHISE_A_NAME);
    const toasts = await authedSellerLeadPage.attemptListingCollectingToasts();
    console.log(`Failing criteria: [${failing.join(', ')}]\nToasts shown:\n${toasts.map((t) => `  ${t}`).join('\n') || '  (none)'}`);
    const listing = authedSellerLeadPage.marketplaceListing;

    if (failing.length === 0) {
      expect(toasts, 'no eligibility error when every criterion passes').toEqual([]);
      await listing.waitForDealTypeStep();
      await listing.cancelDealTypeStep();
      return;
    }

    for (const criterion of CRITERIA) {
      const expected = failing.includes(criterion);
      expect.soft(toasts.some((t) => t.includes(MESSAGES[criterion])), `${criterion} error should ${expected ? '' : 'NOT '}be shown`).toBe(expected);
    }
    const known = Object.values(MESSAGES);
    expect.soft(toasts.filter((t) => !known.some((m) => t.includes(m))), 'no other errors are shown').toEqual([]);
    for (const old of RETIRED_MESSAGES) expect.soft(toasts.join(' '), 'retired message is not shown').not.toContain(old);
    expect(await listing.isDealFormOpen(), 'the New Deal form does not open').toBe(false);
  });
});

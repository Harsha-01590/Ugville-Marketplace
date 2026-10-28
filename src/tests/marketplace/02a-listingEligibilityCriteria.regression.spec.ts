import { test, expect } from '@fixtures/testFixtures';
import { envConfig } from '@config/env.config';
import { Logger } from '@utils/logger';
import {
  ELIGIBILITY_CRITERIA,
  describeEligibilityToasts,
  describeFailingCriteria,
  isCriterionFailing,
  parseFailingCriteria,
  retiredEligibilityMessagesShown,
  toastsShowCriterion,
  unexpectedEligibilityToasts,
  unknownCriteria,
} from '@modules/seller';

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

const failing = parseFailingCriteria(envConfig.MP_FAILING_CRITERIA);

test.describe('Listing Eligibility Criteria @regression @ListingEligibilityCriteria', () => {
  // Covers: SAN_009, SAN_010, SAN_011, EM_012, EM_013, EM_014, UE_001, UE_002, UE_003, UE_004, UE_005, ME_001, ME_004,
  // ME_005
  test(
    `Listing follows the eligibility criteria failing in Salesforce (${describeFailingCriteria(failing)}) @regression`,
    { tag: '@CRIT-01' },
    async ({ authedHomePage, authedSellerLeadPage }) => {
      test.setTimeout(300_000);
      const listing = authedSellerLeadPage.marketplaceListing;

      await test.step('Check MP_FAILING_CRITERIA only lists known criteria', async () => {
        expect(unknownCriteria(failing), `MP_FAILING_CRITERIA may only list: ${ELIGIBILITY_CRITERIA}`).toEqual([]);
      });

      await test.step('Create a fresh seller op for Franchise A', async () => {
        await authedSellerLeadPage.createFromHome(authedHomePage, envConfig.FRANCHISE_A_NAME);
      });

      const toasts = await test.step('Click List in Marketplace and collect the eligibility toasts', async () => {
        const shown = await authedSellerLeadPage.attemptListingCollectingToasts();
        Logger.log(describeEligibilityToasts(failing, shown));
        return shown;
      });

      if (failing.length === 0) {
        await test.step('Verify no eligibility error is shown and the deal form opens, then cancel', async () => {
          expect(toasts, 'no eligibility error when every criterion passes').toEqual([]);
          await listing.waitForDealTypeStep();
          await listing.cancelDealTypeStep();
        });
      } else {
        await test.step('Verify exactly the failing criteria errors are shown', async () => {
          for (const criterion of ELIGIBILITY_CRITERIA) {
            const expected = isCriterionFailing(failing, criterion);
            expect
              .soft(toastsShowCriterion(toasts, criterion), `${criterion} error should ${expected ? '' : 'NOT '}be shown`)
              .toBe(expected);
          }
          expect.soft(unexpectedEligibilityToasts(toasts), 'no other errors are shown').toEqual([]);
          expect.soft(retiredEligibilityMessagesShown(toasts), 'no retired message is shown').toEqual([]);
        });

        await test.step('Verify the New Deal form does not open', async () => {
          expect(await listing.isDealFormOpen(), 'the New Deal form does not open').toBe(false);
        });
      }
    },
  );
});

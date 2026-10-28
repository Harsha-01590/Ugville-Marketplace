import { test, expect } from '@fixtures/testFixtures';
import { envConfig } from '@config/env.config';
import { listFreshDeal, openDealAs } from '@utils/directInvite';
import { Logger } from '@utils/logger';

/**
 * Workflow suite for the Marketplace_Master sheet's workflow:
 * "Marketplace Listing Eligibility Rules"
 * (see the sheet's Workflow Summary / Automation Categorization tabs).
 *
 * A franchise may list an Opportunity only when every eligibility rule holds
 * (DQI >= 70, actively advertising, no Show Stoppers, contact info present,
 * Marketplace access not restricted); otherwise the listing attempt shows an
 * eligibility error.
 *
 * Scope (carried over from the former marketplaceEligibility.regression.spec.ts):
 * - EM_003-014 / UE_001-006 / ME_001-007 / HB_001-003 / EG_001-004/007/010/011
 *   all require flipping backend Salesforce fields with no UI surface
 *   (Showstoppers/Advertising/DQI/Hide flag/inactive user or Account/Contact
 *   Opt-Out/Do Not Call/Sub-Stage DNC/Ad Council eligibility/no-franchise
 *   user) — Out of Scope (No Salesforce Access): Salesforce access cannot be
 *   provided, and this account is fully eligible, so there's no UI-only way
 *   to reach any of those failure states. SAN_017-020 are the same.
 *   Exception: Good Standing / Advertising / DQI are checked in
 *   02a-listingEligibilityCriteria.regression.spec.ts, driven by MP_FAILING_CRITERIA.
 * - EG_008 (null Property Address) would require nulling out a real
 *   Opportunity's address — too destructive; EG_009 (populated address, no
 *   error) is covered by EG_021 in 03-dealListingForm.regression.spec.ts.
 */

/** "586 Kirnwood Dr - Test buyer opp - B" on QA. shortcut: QA-only id, move to .env.<ENV> if this runs elsewhere. */
const BUYER_OPPORTUNITY_ID = '006Uo00000N50N9IAJ';

test.describe('Marketplace Listing Eligibility Rules @regression @Rules', () => {
  // Covers: EG_006
  test(
    '"List in Marketplace"/deal CTA is visible on a Seller Lead Opportunity @regression @T2',
    { tag: '@ELIG-01' },
    async ({ authedHomePage, authedSellerLeadPage }) => {
      test.setTimeout(300_000);

      await test.step('Create a fresh seller op from Home', async () => {
        await authedHomePage.openAndSettle();
        await authedSellerLeadPage.createFromHome(authedHomePage, envConfig.FRANCHISE_A_NAME);
      });

      await test.step('Verify the "List in Marketplace" CTA is shown', async () => {
        const hasCta = await authedSellerLeadPage.hasMarketplaceCta();
        const text = await authedSellerLeadPage.getMarketplaceCtaText();
        Logger.log(`Marketplace CTA present=${hasCta}, text="${text}"`);
        expect(hasCta).toBe(true);
        expect(text).toBe('List in Marketplace');
      });
    },
  );

  // Covers: SAN_015, EG_008
  test(
    'Listing a seller op that has no Property Address is blocked with the address-required message @regression',
    { tag: '@ELIG-02' },
    async ({ authedHomePage, authedSellerLeadPage }) => {
      await test.step('Create a fresh seller op without a Property Address', async () => {
        await authedHomePage.openAndSettle();
        await authedSellerLeadPage.createFromHome(authedHomePage, envConfig.FRANCHISE_A_NAME, 'Converse', {
          skipProperty: true,
        });
      });

      await test.step('Click List in Marketplace', async () => {
        await authedSellerLeadPage.clickListInMarketplace();
      });

      await test.step('Verify the address-required message and that the deal form does not open', async () => {
        // The app words it "A property location is required to list in the Marketplace" (spec: "To add to the
        // Marketplace, a Property Address is required").
        await expect(
          authedSellerLeadPage.getMessageText(/Property Address is required|property location is required/i),
        ).toBeVisible({ timeout: 15000 });
        expect(await authedSellerLeadPage.marketplaceListing.isDealFormOpen(), 'the New Deal form does not open').toBe(
          false,
        );
      });
    },
  );

  // Covers: EG_005, SAN_016
  test(
    'A Buyer Lead Opportunity cannot be listed in the Marketplace @regression',
    { tag: '@ELIG-03' },
    async ({ authedHomePage, authedSellerLeadPage }) => {
      test.skip(envConfig.ENV !== 'qa', 'The Buyer Lead fixture exists on QA only');

      const cta = await test.step('Open the Buyer Lead Opportunity', async () => {
        await authedHomePage.openAndSettle();
        await authedSellerLeadPage.navigateById(BUYER_OPPORTUNITY_ID);
        await authedSellerLeadPage.expectRecordHeaderVisible();
        const text = await authedSellerLeadPage.getMarketplaceCtaText();
        Logger.log(`Buyer opp Marketplace CTA = "${text}"`);
        return text;
      });

      await test.step('Verify listing is not offered, or is refused when tried', async () => {
        if (cta === 'List in Marketplace') {
          // If the CTA shows at all, using it must be refused.
          await authedSellerLeadPage.clickListInMarketplace();
          await expect(authedSellerLeadPage.getMessageText(/Opportunity is not a Seller Lead/i)).toBeVisible({
            timeout: 15000,
          });
        } else {
          expect(cta, 'no "List in Marketplace" on a Buyer Lead').toBe('');
        }
      });
    },
  );

  // =====================================================================
  // Contact / stage opt-outs set from the UI on a fresh seller op
  // (live-verified QA 2026-10-11: the Owner can tick Do Not Call and Email
  // Opt Out on the Lead Contact, and Closed Lost offers "Do Not Contact").
  // =====================================================================

  // Covers: SAN_013, EG_003
  test(
    'A seller op whose contact is Do Not Call cannot be listed @regression',
    { tag: '@ELIG-04' },
    async ({ authedHomePage, authedSellerLeadPage }) => {
      test.setTimeout(300_000);

      await test.step('Create a fresh seller op and set its contact to Do Not Call', async () => {
        await authedHomePage.openAndSettle();
        await authedSellerLeadPage.createFromHome(authedHomePage, envConfig.FRANCHISE_A_NAME);
        await authedSellerLeadPage.setContactOptOut('Do Not Call');
      });

      const toast = await test.step('Try to list it in the Marketplace', async () => {
        const text = await authedSellerLeadPage.attemptListingExpectingError();
        Logger.log(`Listing with a Do Not Call contact: "${text}"`);
        return text;
      });

      await test.step('Verify the Do Not Call error and that the op stays unlisted', async () => {
        expect(toast).toContain('Contact has Do Not Call set to true');
        expect(await authedSellerLeadPage.marketplaceListing.isDealFormOpen(), 'the New Deal form does not open').toBe(
          false,
        );
        expect(await authedSellerLeadPage.isListInMarketplaceCtaShown(), 'still not listed').toBe(true);
      });
    },
  );

  // Covers: SAN_012, EG_001
  test(
    'A seller op whose contact opted out of email cannot be listed @regression',
    { tag: '@ELIG-05' },
    async ({ authedHomePage, authedSellerLeadPage }) => {
      test.setTimeout(300_000);

      await test.step('Create a fresh seller op and opt its contact out of email', async () => {
        await authedHomePage.openAndSettle();
        await authedSellerLeadPage.createFromHome(authedHomePage, envConfig.FRANCHISE_A_NAME);
        await authedSellerLeadPage.setContactOptOut('Email Opt Out');
      });

      const toast = await test.step('Try to list it in the Marketplace', async () => {
        const text = await authedSellerLeadPage.attemptListingExpectingError();
        Logger.log(`Listing with an email-opted-out contact: "${text}"`);
        return text;
      });

      await test.step('Verify the email opt-out error and that the deal form does not open', async () => {
        expect(toast).toContain('Contact has Opted Out of Email');
        expect(await authedSellerLeadPage.marketplaceListing.isDealFormOpen(), 'the New Deal form does not open').toBe(
          false,
        );
      });
    },
  );

  // Covers: EG_002
  test('Once its contact opts out of email, an already-listed deal is moved to the Removed stage @regression', async ({
    authedHomePage,
    authedSellerLeadPage,
    authedMarketplacePage,
    authedMarketplaceDealPage,
  }) => {
    test.setTimeout(300_000);

    const deal = await test.step('List a fresh seller op in the Marketplace', async () => {
      await authedHomePage.openAndSettle();
      const listed = await listFreshDeal(
        authedHomePage,
        authedSellerLeadPage,
        authedMarketplacePage,
        authedMarketplaceDealPage,
        'Assignment',
        '',
      );
      await authedMarketplaceDealPage.close();
      return listed;
    });

    await test.step("Opt the listed op's contact out of email", async () => {
      await authedSellerLeadPage.navigateById(deal.oppId);
      await authedSellerLeadPage.setContactOptOut('Email Opt Out');
    });

    // App behaviour (QA 2026-10-26, MPD-05532): no error toast on View Deal — the opt-out takes the
    // deal off the Marketplace itself. It stays under My Listed Deals in Deal Stage "Removed",
    // with no bid actions and no Withdraw Deal (the sheet expected the opt-out error toast here).
    await test.step('Verify the deal moved to Deal Stage "Removed" with no bid or withdraw actions', async () => {
      expect(await openDealAs(authedMarketplacePage, authedMarketplaceDealPage, deal.mpdId, 'My Listed Deals')).toBe(
        true,
      );
      await expect.poll(() => authedMarketplaceDealPage.getDealStage(), { timeout: 15000 }).toBe('Removed');
      expect(await authedMarketplaceDealPage.getDealDialogText()).toContain('No Bids were placed yet');
      expect(await authedMarketplaceDealPage.hasWithdrawDealOption(), 'no Withdraw Deal on a Removed deal').toBe(false);
      expect(await authedMarketplaceDealPage.isEligibleToBid(), 'no Place Bid on a Removed deal').toBe(false);
      await authedMarketplaceDealPage.close();
    });

    await test.step('Verify the Removed deal is no longer under Available', async () => {
      expect(
        await openDealAs(authedMarketplacePage, authedMarketplaceDealPage, deal.mpdId, 'Available'),
        'Removed deal leaves Available',
      ).toBe(false);
    });
  });

  // Covers: SAN_014, EG_004
  test(
    'A seller op closed as "Do Not Contact" cannot be listed @regression',
    { tag: '@ELIG-07' },
    async ({ authedHomePage, authedSellerLeadPage }) => {
      test.setTimeout(300_000);

      await test.step('Create a fresh seller op and close it Lost as "Do Not Contact"', async () => {
        await authedHomePage.openAndSettle();
        await authedSellerLeadPage.createFromHome(authedHomePage, envConfig.FRANCHISE_A_NAME);
        await authedSellerLeadPage.closeLostDoNotContact();
        await authedSellerLeadPage.reloadAndWait();
        await authedSellerLeadPage.expectRecordHeaderVisible();
      });

      await test.step('Verify the Sub Stage is now Do Not Contact', async () => {
        const subStage = await authedSellerLeadPage.getDetailField('Sub Stage');
        Logger.log(`After Closed Lost: Sub Stage = "${subStage}"`);
        expect(subStage, 'the op is now Do Not Contact').toMatch(/Do Not (Contact|Call)/);
      });

      const listingOffered = await test.step('Check whether listing is still offered after Closed Lost', async () => {
        const offered = await authedSellerLeadPage.isListInMarketplaceCtaShown();
        Logger.log(`CTA after Closed Lost = "${await authedSellerLeadPage.getMarketplaceCtaText()}"`);
        return offered;
      });

      if (listingOffered) {
        const toast = await test.step('Try to list it in the Marketplace', async () => {
          const text = await authedSellerLeadPage.attemptListingExpectingError();
          Logger.log(`Listing a Do Not Contact op: "${text}"`);
          return text;
        });

        await test.step('Verify listing is refused with the Do Not Call error', async () => {
          expect(toast, 'listing is refused').toMatch(/^Error/);
          expect(
            await authedSellerLeadPage.marketplaceListing.isDealFormOpen(),
            'the New Deal form does not open',
          ).toBe(false);
          // "Do Not Contact" also marks the contact Do Not Call, so the app reports the contact flag.
          expect(toast, 'Do Not Call error message').toContain('Contact has Do Not Call set to true');
        });
      }
    },
  );
});

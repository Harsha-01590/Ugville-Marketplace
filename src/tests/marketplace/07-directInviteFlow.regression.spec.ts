import { test, expect } from '@fixtures/testFixtures';
import { envConfig } from '@config/env.config';
import { listFreshDeal, openDealAs } from '@utils/directInvite';
import { tileWindow } from '@utils/windowLayout';
import { Logger } from '@utils/logger';
import { inviteeStatusPattern, labelledValuePattern } from '@modules/marketplace';
import { alternateSubStage } from '@modules/seller';

/**
 * Workflow suite for the Marketplace_Master sheet's workflow:
 * "Direct Invite Flow"
 * (see the sheet's Workflow Summary / Automation Categorization tabs).
 *
 * Scope notes carried over from the former marketplaceDealLifecycle.regression.spec.ts:
 *
 * Marketplace Deal Lifecycle Suite — maps to the Marketplace_Master
 * spreadsheet's "Deal Won - Clawback" (6), "Direct Invite - Listing
 * Perspective" (4), "Direct Invite - Invited Franchise" (3), "Ad Council
 * Type Rules" (4), "Withdraw Deal - Error"/"Withdraw Deal - Flow" (2), and
 * "Test User Isolation" (4) groups (~30 rows).
 *
 * Scope decisions:
 * - Clawback and the Invited-Franchise side of Direct Invite have no direct
 *   UI trigger reachable from a single account/session — both are proxied
 *   via `NotificationsPanelComponent`, whose real historical strings are a
 *   near-exact match for the spreadsheet's expected text ("has been clawed
 *   back due to inactivity", "You have a direct invite for this deal
 *   MPD-XXXXX"), reusing real multi-franchise transaction history already
 *   present in the shared sandbox from prior automated runs. Same
 *   UI-observable-proxy convention as every other backend-originated case
 *   in this suite.
 * - **`NotificationsPanelComponent` bug found and fixed this chunk**: its
 *   `getNotificationItems()`/`getNotificationCount()` locators used
 *   `[ref*="..."]` CSS attribute selectors and `page.locator('generic')` —
 *   `ref` is a Playwright-MCP accessibility-*snapshot*-only pseudo-attribute
 *   (visible in every MCP tool response, e.g. `[ref=f17e2101]`) and
 *   `generic`/`[cursor="pointer"]` are accessibility-tree role/visual
 *   annotations, neither of which exist as real HTML — these locators could
 *   never match anything in an actual browser. Rewritten using the real
 *   `list`/`listitem` structure and the bell's merged
 *   `/^Notifications\d*$/` text (the same inline-badge technique already
 *   proven live by `MarketplacePage.openFromHome()`'s `/^Marketplace\d*$/`).
 *   **Not re-verified live this session** — the Playwright MCP browser tool
 *   was still locked ("Browser is already in use") when this fix was made;
 *   confirm it live in the next session with working tooling.
 * - Direct Invite from the **Listing Franchise's** perspective doesn't need
 *   the notifications proxy at all: `MarketplaceDealStage` already includes
 *   a live-verified `'Direct'` value, filterable directly via `My Listed
 *   Deals` — no new locators needed.
 * - Withdraw Deal reuses `MarketplaceDealPage.hasWithdrawDealOption()`
 *   (existing, already exercised by chunk 4's TC_008/009-style checks) —
 *   no new locators.
 * - Ad Council Type Rules (backend Ad-Council-membership rules) and
 *   Marketplace Delegate assignment (lives on the Account page, never
 *   scaffolded — needs a non-Owner login to verify the permission side too)
 *   stay out of scope, consistent with the earlier NextUG effort's TC_020
 *   skip. Test User Isolation (SAN_075, SD_027-030) is Out of Scope: it needs
 *   a production (non-test) user, and automation never uses one (2026-10-16).
 *
 * Some tests here moved from the former marketplaceMessagesPlatform.regression.spec.ts — its
 * scope notes now live in 14-messagingToastsErrorsContextualCopy.regression.spec.ts.
 */

test.describe('Direct Invite Flow @regression @MarketplaceDirectInviteFlow', () => {
  // =====================================================================
  // Direct Invite — Invited Franchise perspective (notifications proxy)
  // =====================================================================

  test(
    "Direct Invite notifications carry the deal's MPD id for the invited franchise @regression",
    { tag: '@INVITE-01' },
    async ({ authedHomePage, authedNotificationsPanelComponent }) => {
      await test.step('Open the notifications panel from Home', async () => {
        await authedHomePage.openAndSettle();
        await authedNotificationsPanelComponent.openNotifications();
      });

      const directInvites = await test.step('Collect the notifications that mention a Direct Invite', async () => {
        return authedNotificationsPanelComponent.getNotificationItemsMatching(/direct invite/i);
      });

      await test.step('Verify every Direct Invite notification carries an MPD id', async () => {
        Logger.log(`Direct Invite (invited perspective): ${directInvites.length} notification(s) reference one`);
        for (const text of directInvites) {
          expect(text, 'Direct invite notification should reference an MPD id').toMatch(/MPD-\d+/);
        }
      });
    },
  );

  // =====================================================================
  // Direct Invite — Listing Franchise perspective (real Deal Stage filter)
  // =====================================================================

  test(
    'Direct Invite deals are visible to the Listing Franchise via the Direct Deal Stage filter @regression',
    { tag: '@INVITE-02' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Open the Marketplace filtered to My Listed Deals / Direct', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.selectDealStatus('My Listed Deals');
        await authedMarketplacePage.selectDealStage('Direct');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        const n = await authedMarketplacePage.getDealCardCount();
        Logger.log(`Direct Invite (listing perspective): ${n} Direct-stage deal(s) listed by this franchise`);
        return n;
      });

      test.skip(count === 0, 'No Direct-stage listed deal found in current sandbox state');

      await test.step('Open the first Direct-stage deal', async () => {
        await authedMarketplacePage.openDealByIndex(0);
        await authedMarketplaceDealPage.expectLoaded();
      });

      await test.step('Verify the deal shows its MPD id, then close it', async () => {
        const mpdId = await authedMarketplaceDealPage.getMpdId();
        Logger.log(`Direct Invite (listing perspective): opened deal ${mpdId}`);
        expect(mpdId).toMatch(/MPD-\d+/);
        await authedMarketplaceDealPage.close();
      });
    },
  );

  // =====================================================================
  // DI_001: "Invited"/Direct Invite indicator in the deal record view itself
  // =====================================================================

  // Covers: DI_001
  test(
    'The deal record view (not just the card) indicates a Direct Invite @regression',
    { tag: '@INVITE-03' },
    async ({ authedHomePage, authedMarketplacePage, authedMarketplaceDealPage }) => {
      const count = await test.step('Open the Marketplace filtered to My Direct Invites', async () => {
        await authedHomePage.openAndSettle();
        await authedMarketplacePage.navigate();
        await authedMarketplacePage.expectMarketplaceLoaded();
        await authedMarketplacePage.selectDealStatus('My Direct Invites');
        await authedMarketplacePage.applyFilters();
        await authedMarketplacePage.expectMarketplaceLoaded();
        const n = await authedMarketplacePage.getDealCardCount();
        Logger.log(`${n} Direct Invite deal(s)`);
        return n;
      });

      test.skip(count === 0, 'No Direct Invite deal found in current sandbox state');

      await test.step('Open the first Direct Invite deal', async () => {
        await authedMarketplacePage.openDealByIndex(0);
        await authedMarketplaceDealPage.expectLoaded();
      });

      await test.step('Verify the record view shows a Direct Invite indicator, then close it', async () => {
        const present = await authedMarketplaceDealPage.isMessageShown(/invit/i);
        Logger.log(`Direct Invite indicator visible in record view = ${present}`);
        expect(present).toBe(true);
        await authedMarketplaceDealPage.close();
      });
    },
  );
});

// =====================================================================
// Two franchises side by side: Franchise A (authedPage, listing) sends a
// Direct Invite to the owner's other franchise (otherFranchisePage, a second
// tab of the same login, acting through the Bidding Franchise dropdown), which
// declines or accepts. Franchise B never sees Franchise A's deals or invites
// (QA 2026-10-26), so it only checks that isolation here. Flow live-verified
// on QA 2026-10-06/07, re-checked with the other franchise 2026-10-26 (MPD-05535). Each test is ONE end-to-end journey
// —
// create a brand-new seller op on Franchise A (New Seller Opportunity → New
// Contact), list it with a Direct Invite, then act on it as the invited franchise —
// with each sheet case as a test.step. Each deal is opened once per side and
// checked in place; it is only reopened after a state change (decline/accept)
// that the open modal doesn't reflect. One-way: adds 3 Opportunities per run.
// Run `--headed` to watch both windows tiled left (A) / right (B).
// =====================================================================

const INVITEE = envConfig.FRANCHISE_A_OTHER_NAME;

test.describe('Direct Invite — two franchises side by side @regression @MarketplaceDirectInviteFlow @DirectInviteTwoAccount', () => {
  // Create + list + both sides' checks; --headed adds 1.2s slowMo per action.
  test.describe.configure({ timeout: 900_000 });

  test.beforeAll(async ({ authedPage, otherFranchisePage }) => {
    await tileWindow(authedPage, 'left');
    await tileWindow(otherFranchisePage, 'right');
  });

  test.beforeEach(() => {
    test.skip(!INVITEE, `FRANCHISE_A_OTHER_NAME not set in .env.${envConfig.ENV}`);
  });

  // Covers: DI_004/SD_011/SMK_015/SAN_047/DI_005/DI_003/DI_006/SD_013/SD_004
  test(
    'Franchise A creates and lists an Assignment with a Direct Invite, the invited franchise declines it @regression @T1',
    { tag: '@INVITE-04' },
    async ({
      
      authedHomePage,
      authedSellerLeadPage,
      authedMarketplacePage,
      authedMarketplaceDealPage,
      otherFranchiseMarketplacePage,
      otherFranchiseMarketplaceDealPage,
      authedNotificationsPanelComponent,
      
      franchiseBMarketplacePage,
      franchiseBMarketplaceDealPage,
    }) => {
      const a = authedMarketplaceDealPage;
      const b = otherFranchiseMarketplaceDealPage;

      // Covers: DI_004
      const deal = await test.step('Franchise A creates a new seller op from scratch and lists it as Assignment with a Direct Invite to the invited franchise', async () => {
        const listed = await listFreshDeal(
          authedHomePage,
          authedSellerLeadPage,
          authedMarketplacePage,
          a,
          'Assignment',
          INVITEE,
        );
        expect(listed.mpdId).toMatch(/^MPD-\d+$/);
        return listed;
      });

      // Covers: SD_011/SAN_046/MSG_023
      await test.step('On the same open deal, Franchise A sees Deal Stage Direct, "Pending Action from <invitee>" and Withdraw Deal', async () => {
        expect(await a.getDealStage()).toBe('Direct');
        const text = await a.getDealDialogText();
        expect(text).toContain('Assignment');
        expect(await a.hasCorpBadge(), 'Listing picked a corp deal (Lead Type "Corporate")').toBe(false);
        expect(text).toContain(`Direct Invite ${INVITEE} Pending Action from ${INVITEE} In Review`);
        expect(await a.hasWithdrawDealOption()).toBe(true);
        await a.close();
      });

      // Covers: DI_012
      await test.step('Franchise B, not invited, finds the deal under none of its Deal Status views', async () => {
        await franchiseBMarketplacePage.bringToFront();
        for (const status of ['My Direct Invites', 'Available'] as const) {
          expect(
            await openDealAs(franchiseBMarketplacePage, franchiseBMarketplaceDealPage, deal.mpdId, status),
            `not under ${status} for Franchise B`,
          ).toBe(false);
        }
        await otherFranchiseMarketplacePage.bringToFront();
      });

      // Covers: SMK_015/RA_018/SAN_047
      await test.step('The invited franchise sees the deal as the first Marketplace card with an "Invited" tag', async () => {
        await otherFranchiseMarketplacePage.navigate();
        await otherFranchiseMarketplacePage.expectMarketplaceLoaded();
        expect(await otherFranchiseMarketplacePage.getCardMpdId(0)).toBe(deal.mpdId);
        expect(await otherFranchiseMarketplacePage.hasInvitedBadge(0)).toBe(true);
      });

      // Covers: DI_005
      await test.step('Opening that card, the invited franchise sees INVITED, its franchise as bidder, Reason "Direct Invite", and Accept/Decline Invite instead of Place Bid', async () => {
        await otherFranchiseMarketplacePage.openDealByIndex(0);
        await b.expectLoaded();
        await b.selectFranchiseIfPresent(INVITEE);
        const text = await b.getDealDialogText();
        expect(text).toContain('INVITED');
        // SAN_047 asks for a "Direct Invite" badge in the record view; the app shows "INVITED" (asserted above).
        expect.soft(text, '"Direct Invite" badge in record view').toMatch(/Direct Invite/);
        expect(text).toContain(deal.dealTerms);
        expect(text).toContain(INVITEE);
        await expect(b.bidReasonInput).toHaveValue('Direct Invite');
        expect(await b.hasInviteActions()).toBe(true);
        expect(await b.isEligibleToBid(), 'Place Bid must not be offered on a Direct Invite').toBe(false);
      });

      // Covers: DI_003, SD_016, SAN_048, MSG_026
      await test.step('Decline Invite opens the confirmation with the simplified text', async () => {
        await b.selectFranchiseIfPresent(INVITEE);
        const popup = await b.openInviteConfirmation('Decline');
        expect(popup).toContain('Confirmation of Invite Decline');
        expect(popup).toContain('Are you sure you want to decline this invite?');
      });

      // Covers: DI_006
      await test.step('Confirming Decline shows the toast, then the deal shows the declined message with no further actions', async () => {
        await b.confirmInvite('Decline');
        await expect(b.getMessageText('The Marketplace Bid has been Declined')).toBeVisible();
        expect(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'My Direct Invites')).toBe(true);
        // The invitee's user has several qualified franchises; the declined message shows only for the invitee.
        await b.selectFranchiseIfPresent(INVITEE);
        // Seen QA 2026-10-15 (MPD-05217/05218): bid is Declined server-side, but with the invitee picked the
        // dialog shows the plain Place Bid form, no declined message. Soft so the journey finishes.
        expect
          .soft(await b.getDealDialogText(), 'declined message for the invitee')
          .toContain(`${INVITEE} has declined the direct invite for this Marketplace deal.`);
        expect(await b.hasInviteActions()).toBe(false);
        await b.close();
      });

      // Covers: SD_013/SD_014/SD_004/SAN_049
      await test.step("Franchise A sees the invitee's bid as Declined", async () => {
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        const text = await a.getDealDialogText();
        expect(text).toMatch(inviteeStatusPattern(INVITEE, 'Declined'));
        // Sheet expectations not met on QA 2026-10-06/07: no "<Franchise> have
        // Declined this Marketplace Deal.", Actions still "Pending Action from
        // <invitee>", Deal Stage still "Direct". Soft so the journey finishes.
        expect
          .soft(text, 'Declined message to Listing Franchise')
          .toContain(`${INVITEE} have Declined this Marketplace Deal.`);
        expect.soft(text, 'Stale "Pending Action" after decline').not.toContain(`Pending Action from ${INVITEE}`);
        expect
          .soft(await a.getDealStage(), 'Stage after decline (Direct → Ad Council)')
          .toBe('Ad Council');
        await a.close();
      });

      // Covers: DI_019
      await test.step('The declined invite cannot be accepted later from My Direct Invites, Available or My Bids', async () => {
        await otherFranchiseMarketplacePage.bringToFront();
        for (const status of ['My Direct Invites', 'Available', 'My Bids'] as const) {
          if (!(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, status))) {
            Logger.log(`  [DirectInvite] declined ${deal.mpdId} not listed under ${status}`);
            continue;
          }
          await b.selectFranchiseIfPresent(INVITEE);
          expect(await b.hasInviteActions(), `no Accept/Decline Invite under ${status}`).toBe(false);
          // Product to confirm whether a normal bid is allowed once the deal reaches Ad Council.
          Logger.log(
            `  [DirectInvite] declined ${deal.mpdId} under ${status}: Place Bid offered = ${await b.isEligibleToBid()}`,
          );
          await b.close();
        }
      });

      // Covers: DI_020
      await test.step('Franchise A gets a web notification that the invited franchise declined the invite', async () => {
        await authedHomePage.navigate();
        await authedNotificationsPanelComponent.openNotifications();
        const items = await authedNotificationsPanelComponent.getNotificationsText();
        // Not seen on QA 2026-10-06 (Direct Invite Findings F07); product to confirm.
        expect.soft(items, 'declined-invite notification names the deal').toContain(deal.mpdId);
        expect.soft(items, 'declined-invite notification to the Listing Franchise').toMatch(/declined/i);
      });
    },
  );

  // Covers: DI_007/DI_002/DI_008/DI_009/DI_010/DI_018/DI_011
  test(
    'Franchise A creates and lists an Opportunity with a Direct Invite, the invited franchise accepts it and takes over the same record @regression',
    { tag: '@INVITE-05' },
    async ({
      
      authedHomePage,
      authedSellerLeadPage,
      authedMarketplacePage,
      authedMarketplaceDealPage,
      otherFranchiseHomePage,
      otherFranchiseMarketplacePage,
      otherFranchiseMarketplaceDealPage,
      otherFranchiseSellerLeadPage,
      authedNotificationsPanelComponent,
      otherFranchiseNotificationsPanelComponent,
    }) => {
      const a = authedMarketplaceDealPage;
      const b = otherFranchiseMarketplaceDealPage;

      // Covers: DI_007, DI_025
      const deal = await test.step('Franchise A creates a new seller op from scratch, logs a call on it, and lists it as Opportunity with a Direct Invite to the invited franchise', async () => {
        const listed = await listFreshDeal(
          authedHomePage,
          authedSellerLeadPage,
          authedMarketplacePage,
          a,
          'Opportunity',
          INVITEE,
          {
            beforeList: () => authedSellerLeadPage.clickLogACall(''), // Subject is a lookup; the default "Call" is kept
          },
        );
        expect(listed.mpdId).toMatch(/^MPD-\d+$/);
        // Covers: LF_020 — listing franchise's view (still open on My Listed Deals)
        const listedText = await a.getDealDialogText();
        expect(listedText, 'Franchise A sees the Deal Terms verbatim').toContain(listed.dealTerms);
        expect(listedText, 'Franchise A sees the Opportunity Details verbatim').toContain(listed.oppDetails);
        await a.close();
        return listed;
      });

      // Covers: DI_002, SD_015, SAN_048
      await test.step('Accept Invite opens the confirmation with the simplified text, Deal Terms, Reason for Bid and an unticked Terms of Use', async () => {
        expect(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'My Direct Invites')).toBe(true);
        // Covers: LF_020 — invited franchise's view
        const invitedText = await b.getDealDialogText();
        expect(invitedText, 'the invited franchise sees the Deal Terms verbatim').toContain(deal.dealTerms);
        expect(invitedText, 'the invited franchise sees the Opportunity Details verbatim').toContain(deal.oppDetails);
        await b.selectFranchiseIfPresent(INVITEE);
        const popup = await b.openInviteConfirmationText('Accept');
        expect(popup).toContain('Confirmation of Invite Acceptance');
        expect(popup).toContain('Are you sure you want to accept this invite?');
        expect(popup).toMatch(labelledValuePattern('Deal Terms', deal.dealTerms));
        expect(popup).toMatch(/Reason for Bid\s*Direct Invite/);
        expect(popup).toContain(
          'I have authority to bind my Franchisee and agree to The UGVille Marketplace - Terms & Conditions.',
        );
        expect(await b.isTermsOfUseChecked()).toBe(false);
      });

      // Covers: DI_008
      await test.step('Ticking Terms of Use and confirming wins the deal for the invited franchise immediately', async () => {
        // Observed QA 2026-10-06/07: Confirm is already enabled before Terms of Use is ticked.
        expect
          .soft(await b.isInviteConfirmEnabled(), 'Confirm should stay disabled until Terms of Use is ticked')
          .toBe(false);
        await b.confirmInvite('Accept');
        expect(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'My Bids')).toBe(true);
        expect(await b.getDealStage()).toBe('Bid Accepted');
        expect(await b.getAdditionalField('Opp Transferred')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        const text = await b.getDealDialogText();
        expect(text).toContain('This Marketplace deal has already been won.');
        expect(text).toContain(`The winning franchise for this deal is: ${INVITEE}.`);
      });

      // Covers: DI_018
      await test.step('On the same open deal, the invited franchise links to the SAME opportunity record, not a copy', async () => {
        expect(await b.getSourceOpportunityId()).toBe(deal.oppId);
        await b.close();
      });

      // Covers: DI_009
      await test.step('The won deal leaves Available, and My Direct Invites no longer offers Accept/Decline', async () => {
        expect(
          await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'Available'),
          'Won deal must leave Available',
        ).toBe(false);
        expect(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'My Direct Invites')).toBe(true);
        await b.selectFranchiseIfPresent(INVITEE);
        expect(await b.hasInviteActions(), 'Accepted invite must not offer Accept/Decline again').toBe(false);
        await b.close();
      });

      // Covers: EG_031/DI_010 + DI_018
      await test.step('Franchise A sees Bid Accepted, Opp Transferred, the invitee as winner, no Withdraw Deal, and has lost the opportunity link', async () => {
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        expect(await a.getDealStage()).toBe('Bid Accepted');
        expect(await a.getAdditionalField('Opp Transferred')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        expect(await a.getDealDialogText()).toContain(`The winning franchise for this deal is: ${INVITEE}.`);
        expect(await a.hasWithdrawDealOption()).toBe(false);
        expect(await a.getSourceOpportunityHref(), 'Listing Franchise must lose the opportunity link').toBe('');
        await a.close();
      });

      // Covers: DI_018
      await test.step('The opportunity record itself now belongs to the invited franchise', async () => {
        await otherFranchiseSellerLeadPage.navigateById(deal.oppId);
        expect(await otherFranchiseSellerLeadPage.getAccountName()).toBe(INVITEE);
        expect(await otherFranchiseSellerLeadPage.getOpportunityOwner()).not.toBe('');
      });

      // Covers: DI_025
      await test.step('The call Franchise A logged before listing is on the record the invited franchise now owns', async () => {
        await otherFranchiseSellerLeadPage.navigateById(deal.oppId);
        expect(
          await otherFranchiseSellerLeadPage.hasLoggedCallInTimeline(),
          'logged call carried over in the Timeline',
        ).toBe(true);
      });

      // Covers: DI_011
      await test.step('Both franchises get the accept web notifications', async () => {
        await otherFranchiseHomePage.navigate();
        await otherFranchiseNotificationsPanelComponent.openNotifications();
        const bItems = await otherFranchiseNotificationsPanelComponent.getNotificationsText();
        // QA 2026-10-26 (MPD-05535): no "You have a direct invite for this deal" notification when
        // the invited franchise belongs to the inviting user — only the accept notifications arrive.
        expect(bItems).not.toContain(`You have a direct invite for this deal ${deal.mpdId}`);
        expect(bItems).toContain(`Your bid has been accepted for this opportunity ${deal.mpdId}`);

        await authedHomePage.navigate();
        await authedNotificationsPanelComponent.openNotifications();
        expect(
          await authedNotificationsPanelComponent.hasNotificationContainingAll(
            `${deal.mpdId} `,
            `has been accepted by ${INVITEE}`,
          ),
          'Franchise A is notified the invitee accepted',
        ).toBe(true);
      });
    },
  );

  // Covers: SD_012/DI_013
  test(
    'Franchise A withdraws a pending Direct Invite while the invited franchise has it open @regression',
    { tag: '@INVITE-06' },
    async ({
      
      
      authedHomePage,
      authedSellerLeadPage,
      authedMarketplacePage,
      authedMarketplaceDealPage,
      otherFranchiseMarketplacePage,
      otherFranchiseMarketplaceDealPage,
    }) => {
      const a = authedMarketplaceDealPage;
      const b = otherFranchiseMarketplaceDealPage;


      const deal = await test.step('Franchise A lists a new seller op as Assignment with a Direct Invite to the invited franchise, which opens it (window kept open)', async () => {
        const listed = await listFreshDeal(
          authedHomePage,
          authedSellerLeadPage,
          authedMarketplacePage,
          a,
          'Assignment',
          INVITEE,
        );
        await otherFranchiseMarketplacePage.bringToFront();
        expect(await openDealAs(otherFranchiseMarketplacePage, b, listed.mpdId, 'My Direct Invites')).toBe(true);
        await b.selectFranchiseIfPresent(INVITEE);
        expect(await b.hasInviteActions()).toBe(true);
        // Covers: DI_014 — B gets as far as the ticked Accept confirmation, then waits.
        await b.openInviteConfirmation('Accept');
        await b.tickTermsOfUse();
        return listed;
      });

      // Covers: SD_012
      await test.step('With the invite still pending, Franchise A withdraws the deal — "Deal Withdrawn Successfully"', async () => {
        await authedMarketplacePage.bringToFront();
        expect(await a.hasWithdrawDealOption()).toBe(true);
        await a.withdrawDeal();
        const toast = await a.waitForToastText();
        Logger.log(`  [DirectInvite] Withdraw Deal toast: "${toast}"`);
        expect(toast).toContain('Deal Withdrawn Successfully');
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals'),
          'Withdrawn deal leaves My Listed Deals',
        ).toBe(false);
      });

      // Covers: DI_014
      await test.step('Confirming the Accept that was left open is refused: the invited franchise does not win the withdrawn deal', async () => {
        await otherFranchiseMarketplacePage.bringToFront();
        const toast = b.waitForToastText(40000);
        await b.confirmInvite('Accept').catch(() => {}); // a refused confirm can leave the popup open
        const text = await toast;
        Logger.log(`  [DirectInvite] Accept after withdraw: "${text}"`);
        // Seen QA 2026-10-11: the late Accept returns "The Marketplace Bid has been Accepted" on the withdrawn deal.
        expect.soft(text, 'the late Accept is refused with an error').toMatch(/^Error/);
        await b.cancelInviteConfirmation().catch(() => {});
        await b.close();
        if (await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'My Bids')) {
          // Seen QA 2026-10-11 (MPD-05118): the invited franchise DOES win the withdrawn deal.
          await b.selectFranchiseIfPresent(INVITEE);
          expect
            .soft(await b.getDealDialogText(), 'the invited franchise did not win it')
            .not.toContain(`The winning franchise for this deal is: ${INVITEE}.`);
          await b.close();
        }
      });

      // Covers: DI_013
      await test.step('The invited franchise, reopening its invites, can no longer Accept/Decline the withdrawn deal', async () => {
        await otherFranchiseMarketplacePage.bringToFront();
        const stillListed = await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'My Direct Invites');
        if (stillListed) {
          await b.selectFranchiseIfPresent(INVITEE);
          expect(await b.hasInviteActions(), 'Withdrawn invite must not offer Accept/Decline').toBe(false);
          await b.close();
        }
        expect(
          await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'Available'),
          'Withdrawn deal leaves Available',
        ).toBe(false);
      });
    },
  );

  // Product rule (from the QA lead, 2026-10-06): an accepted Opportunity deal moves
  // the whole opportunity to the winner (it pays the full amount); an accepted
  // Assignment deal leaves the listing franchise its original and gives the winner
  // its own copy (it pays the listing franchise per Deal Terms when it sells).

  // DI_026's "the Invited Franchise cannot open the original" isn't checked: here both franchises
  // belong to one login, which can open both records, and Franchise B can't be invited (QA 2026-10-26).
  // Covers: DI_021/DI_017
  test(
    'Franchise A creates and lists an Assignment with a Direct Invite, the invited franchise accepts it and both keep their own opportunity @regression',
    { tag: '@INVITE-07' },
    async ({
      
      
      authedHomePage,
      authedSellerLeadPage,
      authedMarketplacePage,
      authedMarketplaceDealPage,
      otherFranchiseMarketplacePage,
      otherFranchiseMarketplaceDealPage,
      otherFranchiseSellerLeadPage,
    }) => {
      const a = authedMarketplaceDealPage;
      const b = otherFranchiseMarketplaceDealPage;

      // Covers: DI_021
      const deal = await test.step('Franchise A creates a new seller op from scratch and lists it as Assignment with a Direct Invite to the invited franchise', async () => {
        const listed = await listFreshDeal(
          authedHomePage,
          authedSellerLeadPage,
          authedMarketplacePage,
          a,
          'Assignment',
          INVITEE,
        );
        await a.close();
        return listed;
      });

      // Covers: DI_021
      await test.step('The invited franchise accepts the invite and sees Bid Accepted', async () => {
        expect(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'My Direct Invites')).toBe(true);
        await b.selectFranchiseIfPresent(INVITEE);
        await b.openInviteConfirmation('Accept');
        await b.confirmInvite('Accept');
        expect(await openDealAs(otherFranchiseMarketplacePage, b, deal.mpdId, 'My Bids')).toBe(true);
        expect(await b.getDealStage()).toBe('Bid Accepted');
      });

      // Covers: DI_017
      const copyId = await test.step('On the same open deal, the invited franchise links to its own copy, not the original', async () => {
        const id = await b.getSourceOpportunityId();
        await b.close();
        expect(id, 'Invited Franchise must link to an opportunity').not.toBe('');
        expect(id, 'Invited Franchise must get a separate copy, not the original').not.toBe(deal.oppId);
        return id;
      });

      // Covers: DI_017
      await test.step('After the accept, Franchise A still links to its original opportunity', async () => {
        expect(
          await openDealAs(authedMarketplacePage, a, deal.mpdId, 'My Listed Deals', envConfig.FRANCHISE_A_NAME),
        ).toBe(true);
        expect(await a.getSourceOpportunityId(), 'Listing Franchise keeps its original').toBe(deal.oppId);
        await a.close();
      });

      // Covers: DI_017
      await test.step('The original stays with Franchise A and the copy belongs to the invited franchise', async () => {
        await authedSellerLeadPage.navigateById(deal.oppId);
        expect(await authedSellerLeadPage.getAccountName(), 'Original stays with the Listing Franchise').toBe(
          deal.listingAccount,
        );
        await otherFranchiseSellerLeadPage.navigateById(copyId);
        expect(await otherFranchiseSellerLeadPage.getAccountName(), 'Copy belongs to the Invited Franchise').toBe(INVITEE);
      });

      // Covers: DI_026
      const { originalSubStage, target } =
        await test.step("Read the Sub Stage on Franchise A's original and pick a different one", async () => {
          await authedSellerLeadPage.navigateById(deal.oppId);
          const current = await authedSellerLeadPage.getDetailField('Sub Stage');
          return { originalSubStage: current, target: alternateSubStage(current) };
        });

      await test.step(`The invited franchise changes the Sub Stage on its copy to "${target}"`, async () => {
        await otherFranchiseSellerLeadPage.navigateById(copyId);
        await otherFranchiseSellerLeadPage.setSubStage(target);
        await otherFranchiseSellerLeadPage.navigateById(copyId);
        expect(await otherFranchiseSellerLeadPage.getDetailField('Sub Stage'), 'copy saved the new Sub Stage').toBe(
          target,
        );
      });

      await test.step("Verify Franchise A's original keeps its own Sub Stage", async () => {
        await authedSellerLeadPage.navigateById(deal.oppId);
        expect(await authedSellerLeadPage.getDetailField('Sub Stage'), 'original is unchanged').toBe(originalSubStage);
      });
    },
  );
});

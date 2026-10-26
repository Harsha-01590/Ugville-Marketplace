import * as path from 'path';
import * as fs from 'fs';

/**
 * Environment configuration loader.
 * Reads from .env.<ENV> files based on the ENV environment variable.
 */
export interface EnvConfig {
  BASE_URL: string;
  UGVILLE_USERNAME: string;
  UGVILLE_PASSWORD: string;
  // Second-role credentials for permission/access-restriction tests. Optional —
  // any test that needs one skips itself at runtime if the value is blank.
  COORDINATOR_USERNAME: string;
  COORDINATOR_PASSWORD: string;
  BUYER_USERNAME: string;
  BUYER_PASSWORD: string;
  // Second franchise account, for cross-account marketplace tests (list an
  // Opportunity as the primary/UGVILLE account, then view/accept/verify it
  // as this account). Optional — tests using it skip at runtime if blank.
  FRANCHISE_B_USERNAME: string;
  FRANCHISE_B_PASSWORD: string;
  // Franchise B's franchise (Account) name as shown in the Direct Invite
  // dropdown — the invitee for the two-account Direct Invite suite.
  FRANCHISE_B_NAME: string;
  // Franchise A's (UGVILLE_USERNAME's) Account name — the Account the Direct
  // Invite suite creates its fresh seller Opportunity under.
  FRANCHISE_A_NAME: string;
  // The second franchise UGVILLE_USERNAME's owner also owns. Franchises only see each other's
  // deals within this pair (QA 2026-10-26: Franchise B never sees Franchise A's deals), so it is
  // the counterparty for bidding / Direct Invite flows, acting via the Bidding Franchise dropdown.
  FRANCHISE_A_OTHER_NAME: string;
  // Marketplace fixture Opportunity records — environment-specific, so they
  // live per .env.<ENV>. The marketplace eligibility/messages suites run a
  // real "List in Marketplace" mutation against these, so any test needing
  // one skips itself at runtime when the value is blank (e.g. on an
  // environment where no fixture record has been designated yet).
  MARKETPLACE_ELIGIBLE_OPPORTUNITY_ID: string;
  MARKETPLACE_FORM_TEST_OPPORTUNITY_ID: string;
  MARKETPLACE_FORM_TEST_OPPORTUNITY_LOCATION: string;
  // One-way fixtures for the Deal Listing Form save tests (LF_010-015): each
  // is really listed once (as Assignment / as Opportunity) and can't be reused.
  MARKETPLACE_ASSIGNMENT_LISTING_OPPORTUNITY_ID: string;
  MARKETPLACE_OPPORTUNITY_LISTING_OPPORTUNITY_ID: string;
  // A franchise-name fragment that returns Direct Invite suggestions (LF_016).
  MARKETPLACE_DIRECT_INVITE_SEARCH_TERM: string;
  // Listing criteria Franchise A currently fails in Salesforce (comma list of
  // goodStanding, advertising, dqi; blank = all pass). Read by 02a-listingEligibilityCriteria.
  MP_FAILING_CRITERIA: string;
  ENV: 'qa' | 'uat' | 'staging';
  BROWSER: 'chrome' | 'firefox' | 'webkit';
  HEADLESS: boolean;
}

function loadEnvFile(envName: string): Record<string, string> {
  const envFile = path.resolve(__dirname, '../../', `.env.${envName}`);
  const vars: Record<string, string> = {};

  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      vars[key.trim()] = valueParts.join('=').trim();
    }
  }

  return vars;
}

const envName = process.env.ENV || 'qa';
const fileVars = loadEnvFile(envName);

/** Merged environment configuration (process.env overrides file values) */
export const envConfig: EnvConfig = {
  BASE_URL: process.env.BASE_URL || fileVars.BASE_URL || 'https://homevestors--qa.sandbox.my.site.com/ugville',
  UGVILLE_USERNAME: process.env.UGVILLE_USERNAME || fileVars.UGVILLE_USERNAME || '',
  UGVILLE_PASSWORD: process.env.UGVILLE_PASSWORD || fileVars.UGVILLE_PASSWORD || '',
  COORDINATOR_USERNAME: process.env.COORDINATOR_USERNAME || fileVars.COORDINATOR_USERNAME || '',
  COORDINATOR_PASSWORD: process.env.COORDINATOR_PASSWORD || fileVars.COORDINATOR_PASSWORD || '',
  BUYER_USERNAME: process.env.BUYER_USERNAME || fileVars.BUYER_USERNAME || '',
  BUYER_PASSWORD: process.env.BUYER_PASSWORD || fileVars.BUYER_PASSWORD || '',
  FRANCHISE_B_USERNAME: process.env.FRANCHISE_B_USERNAME || fileVars.FRANCHISE_B_USERNAME || '',
  FRANCHISE_B_PASSWORD: process.env.FRANCHISE_B_PASSWORD || fileVars.FRANCHISE_B_PASSWORD || '',
  FRANCHISE_B_NAME: process.env.FRANCHISE_B_NAME || fileVars.FRANCHISE_B_NAME || '',
  FRANCHISE_A_NAME: process.env.FRANCHISE_A_NAME || fileVars.FRANCHISE_A_NAME || '',
  FRANCHISE_A_OTHER_NAME: process.env.FRANCHISE_A_OTHER_NAME || fileVars.FRANCHISE_A_OTHER_NAME || '',
  MARKETPLACE_ELIGIBLE_OPPORTUNITY_ID:
    process.env.MARKETPLACE_ELIGIBLE_OPPORTUNITY_ID || fileVars.MARKETPLACE_ELIGIBLE_OPPORTUNITY_ID || '',
  MARKETPLACE_FORM_TEST_OPPORTUNITY_ID:
    process.env.MARKETPLACE_FORM_TEST_OPPORTUNITY_ID || fileVars.MARKETPLACE_FORM_TEST_OPPORTUNITY_ID || '',
  MARKETPLACE_FORM_TEST_OPPORTUNITY_LOCATION:
    process.env.MARKETPLACE_FORM_TEST_OPPORTUNITY_LOCATION || fileVars.MARKETPLACE_FORM_TEST_OPPORTUNITY_LOCATION || '',
  MARKETPLACE_ASSIGNMENT_LISTING_OPPORTUNITY_ID:
    process.env.MARKETPLACE_ASSIGNMENT_LISTING_OPPORTUNITY_ID || fileVars.MARKETPLACE_ASSIGNMENT_LISTING_OPPORTUNITY_ID || '',
  MARKETPLACE_OPPORTUNITY_LISTING_OPPORTUNITY_ID:
    process.env.MARKETPLACE_OPPORTUNITY_LISTING_OPPORTUNITY_ID || fileVars.MARKETPLACE_OPPORTUNITY_LISTING_OPPORTUNITY_ID || '',
  MARKETPLACE_DIRECT_INVITE_SEARCH_TERM:
    process.env.MARKETPLACE_DIRECT_INVITE_SEARCH_TERM || fileVars.MARKETPLACE_DIRECT_INVITE_SEARCH_TERM || '',
  MP_FAILING_CRITERIA: process.env.MP_FAILING_CRITERIA ?? fileVars.MP_FAILING_CRITERIA ?? '',
  ENV: (process.env.ENV || fileVars.ENV || 'qa') as EnvConfig['ENV'],
  BROWSER: (process.env.BROWSER || fileVars.BROWSER || 'chrome') as EnvConfig['BROWSER'],
  HEADLESS: (process.env.HEADLESS || fileVars.HEADLESS || 'true') === 'true',
};

# Ugville Marketplace — E2E Test Automation

End-to-end test suite for the **Marketplace** module of the Ugville platform (a Salesforce Experience Cloud site), built with [Playwright](https://playwright.dev) and TypeScript using the Page Object Model (POM). It was split out of the larger `ugville-automation` project and covers only Marketplace behaviour.

## What it covers

173 tests across 17 spec files in `src/tests/marketplace/`. The `NN-` prefix sets the run order, so keep new specs numbered.

| Spec                   | Area                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| `01-marketplace.smoke` | Smoke checks                                                              |
| `02a` / `02`           | Listing eligibility criteria and rules (DQI ≥ 70 plus the other criteria) |
| `03`                   | Deal Listing Form                                                         |
| `04`                   | Browse, map view, filters and search                                      |
| `05`                   | Deal card and deal detail view                                            |
| `06`                   | Visibility matrix, ad council, stage rules                                |
| `07`                   | Direct Invite flow (two accounts)                                         |
| `08`–`11`              | Bidding: place, accept, decline, withdraw bid / withdraw deal             |
| `12`                   | Deal won and clawback                                                     |
| `13`                   | Notifications: push, preferences, alerts                                  |
| `14`                   | Messaging, toasts, errors, contextual copy                                |
| `15`                   | Roles, permissions, multi-franchise isolation                             |
| `16`                   | Cross-platform behaviour                                                  |

Each test carries a unique `@<MODULE>-NN` tag, plus `@smoke` or `@regression`. Scenario IDs from the scope sheet appear only in `// Covers:` comments, never in test titles.

## Tech stack

- Playwright Test 1.61 with TypeScript 6.0 (pinned: `typescript-eslint` does not support TypeScript 7 yet)
- Allure and Playwright HTML reports, plus a custom Excel reporter
- ESLint 9 (`typescript-eslint`, `eslint-plugin-playwright`, `@stylistic/eslint-plugin` for formatting — no Prettier), enforced by a Husky pre-push hook and GitHub Actions
- `cross-env` for per-environment runs, `exceljs` for report output

## Project structure

```
src/
├── config/        env.config.ts (loads .env.<ENV>), globalSetup.ts (logs every account in once)
├── enums/         routes
├── fixtures/      testFixtures.ts (typed fixture interfaces, page objects as fixtures), data/testData.json
├── modules/       Page Objects, one folder per feature
│   ├── auth/  dashboard/  marketplace/  notifications/  seller/
├── shared/        BasePage and reusable components (e.g. ModalComponent)
├── reporters/     excelReporter.ts
├── utils/         sessionStore (saved logins), authHelper, directInvite, windowLayout, logger, apexFailure
└── tests/
    └── marketplace/   *.spec.ts
playwright.config.ts   projects, reporters, timeouts
eslint.config.mjs      lint and formatting rules
.husky/pre-push        runs `npm run verify` before every push
.github/workflows/     CI: the same checks on every push and pull request
.env.example           environment template
```

## Getting started

Prerequisites: Node.js 18+, Google Chrome (the default project uses the `chrome` channel), and access to the Ugville sandbox you want to test.

```bash
git clone https://github.com/Harsha-01590/Ugville-Marketplace.git
cd Ugville-Marketplace
npm install
npx playwright install
```

### Configure the environment

The suite is multi-environment. Copy the template once per environment:

```bash
cp .env.example .env.qa     # also .env.uat, .env.staging
```

Fill in the values. At minimum you need `BASE_URL`, `UGVILLE_USERNAME` and `UGVILLE_PASSWORD`. The rest are optional, and tests that need a blank value **skip themselves**:

- `COORDINATOR_*` and `BUYER_*`: second-role accounts for permission tests
- `FRANCHISE_B_*`, `FRANCHISE_A_NAME`, `FRANCHISE_A_OTHER_NAME`: cross-franchise, bidding and Direct Invite tests
- `MARKETPLACE_*_OPPORTUNITY_ID`: synthetic, unlisted Opportunities that the "List in Marketplace" tests really list (one-way, so each ID can be used once)
- `MP_FAILING_CRITERIA`: eligibility criteria that Franchise A currently fails in Salesforce

`ENV` selects which `.env.<ENV>` file loads (`qa`, `uat` or `staging`).

### Running on another machine — checklist

Nothing in `src/` is machine-specific. Account names, credentials and record IDs all come from `.env.<ENV>`, so moving to a new system needs no code changes:

1. Install Node.js 18+ and Google Chrome (the projects use `channel: 'chrome'`). Then run `npm install` and `npx playwright install`.
2. Create `.env.<ENV>` from `.env.example`. The files are git-ignored, so copy your real ones over separately and securely.
3. Make sure the **required** values are set. Tests that need them **fail**, not skip, when they're blank:
   - `BASE_URL`, `UGVILLE_USERNAME`, `UGVILLE_PASSWORD` (`globalSetup` aborts the whole run without the credentials)
   - `FRANCHISE_A_NAME`, the Account that owns `UGVILLE_USERNAME`; the eligibility suite creates its seller Opportunity under it
4. Set the **optional** values to get full coverage. Anything left blank makes the dependent tests skip (about 68 `test.skip` calls in total):
   - `FRANCHISE_B_USERNAME`, `FRANCHISE_B_PASSWORD`, `FRANCHISE_B_NAME` for cross-franchise tests
   - `FRANCHISE_A_OTHER_NAME` for bidding and Direct Invite
   - `COORDINATOR_*` and `BUYER_*` for role tests
   - the `MARKETPLACE_*_OPPORTUNITY_ID` values and `MARKETPLACE_DIRECT_INVITE_SEARCH_TERM`
5. Check that the target org's data matches what the tests assume:
   - Franchise A passes all listing criteria (DQI ≥ 70, good standing, advertising). Otherwise list the failing ones in `MP_FAILING_CRITERIA`.
   - The Franchise A owner also owns a second franchise, and Franchise B is **not** visible to Franchise A. Cross-franchise tests rely on this.
   - The `MARKETPLACE_*` Opportunities are synthetic, unlisted, "Contact"-stage records with a full address and contact details. Listing is one-way, so use **fresh** ones for each new environment.
6. Headless runs (`npm test`) work on Linux, macOS and Windows. Headed runs pass `--ozone-platform=x11` and tile two windows (`src/utils/windowLayout.ts`), which is Linux-specific. Both are harmless elsewhere but may not tile.
7. Playwright runs 2 workers with a 120 s timeout. On a slower network or machine, raise `timeout` in `playwright.config.ts` before you assume a test is broken.

## Login sessions

Every account is logged in **once, at the start of the run**, and its session is reused for the rest of it:

1. `globalSetup` logs in each account that has credentials in `.env.<ENV>` (primary, Franchise B, Buyer, Coordinator) in parallel. It saves each session (Playwright `storageState`: cookies and local storage) to `.auth/<ENV>/<account>.json`.
2. The fixtures (`authedPage`, `franchiseBPage`, `buyerRolePage`, `coordinatorRolePage`) open their context **from that saved session** instead of logging in again.
3. If a saved session has expired, the fixture logs in through the UI and re-saves it. A login-recovery handler also logs back in if Salesforce drops the session mid-run, so any account can log in again at any point.

The next run reuses a saved session younger than `AUTH_SESSION_MAX_AGE_MIN` (default 60) without logging in at all. `npm run auth:clear` deletes every saved session, so the next run logs in fresh. `.auth/` is git-ignored because it holds live session cookies.

## Running tests

```bash
npm test                    # default environment
npm run test:qa             # ENV=qa
npm run test:uat            # ENV=uat
npm run test:smoke          # @smoke only
npm run test:regression     # @regression only
npm run test:eligibility    # @ListingEligibilityCriteria
npm run test:headed         # watch the browser (slowMo applied)
npm run test:debug          # Playwright inspector
npm run test:ui             # Playwright UI mode
npm run test:cross-browser  # regression on chrome, firefox, webkit
npx playwright test src/tests/marketplace/08-biddingPlaceBid.regression.spec.ts   # one spec
npx playwright test --grep @BID-01                                                # one test by tag
```

Notes on how the suite runs:

- Specs run in alphabetical order (the `NN-` prefix), with `fullyParallel: false` and 2 workers, because the Salesforce sandbox is sensitive to concurrent state changes.
- Some suites use two logged-in accounts at once (for example Direct Invite and bidding); headed runs tile the two windows left and right.
- Timeouts are generous (120 s per test) because the sandbox is slow.
- Traces, screenshots and videos are kept on failure.

## Reports

```bash
npm run report              # Playwright HTML report (playwright-report/)
npm run report:allure       # generate and open the Allure report
npm run report:allure:serve # serve Allure results directly
```

An Excel results file is also written to `reports/` after each run. All report output is git-ignored.

## Conventions

- **Page Objects** live in `src/modules/<feature>/pages` (and `/components`) and are exposed as fixtures in `src/fixtures/testFixtures.ts`. Fixture shapes are declared as `interface`s (`WorkerFixtures`, `TestFixtures`).
- **Locators are declared at the top of each page or component**, in its Locators section, and methods use them by name:
  - Fixed locators are `readonly` fields, each with a short doc comment, assigned in the constructor.
  - Locators that need an argument (a label, a name, an index) are small locator methods directly under the constructor.
  - Specs never build locators. They call page-object methods, or `messageText()` from `BasePage` to assert on an app message.
- **Every test is split into `test.step()`s** that read in order: open the page, act, verify. Steps return the values later steps need. `test.skip()` stays outside steps, so a skip is reported as a skip, not as a failed step.
- **Test titles describe the scenario only.** Put sheet and defect IDs in `// Covers:` comments.
- **The app is the source of truth.** When the scope sheet and the app disagree, align the tests to the app.
- **Mobile is out of scope** for coverage work.

## Code quality: linting, formatting and the pre-push check

```bash
npm run verify        # typecheck + lint, formatting included (what the pre-push hook and CI run)
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint
npm run lint:fix      # ESLint with auto-fix
npm run format        # alias of lint:fix (ESLint fixes formatting)
npm run format:check  # alias of lint
```

- **Pre-push hook:** `npm install` sets up Husky automatically (the `prepare` script). Every `git push` then runs `npm run verify` first and is **blocked** if type-checking, linting or formatting fails.
- **CI:** `.github/workflows/ci.yml` runs the same checks on GitHub for every push and pull request, so they apply even if the local hook is skipped.
- **Rules (all errors):** `typescript-eslint` recommended rules plus no `any`, no unused vars, explicit function return types, no non-null assertions (`!`), `import type` for type-only imports, `interface` over `type` for object shapes, `eqeqeq`, `prefer-const`, `no-var` and no `console.*` (log through `src/utils/logger.ts`). Specs also get `eslint-plugin-playwright`, which blocks `test.only`, invalid titles, element handles and eval.
- **Warnings don't block.** The remaining warnings are deliberate `waitForTimeout` settle waits for the slow Salesforce sandbox.
- **Formatting (`@stylistic`, replaces Prettier):** 2-space indent, single quotes, semicolons, 120-character lines, trailing commas in multiline structures, arrow-function parens always. `npm run lint:fix` applies them.

## What is not in the repo

These are listed in `.gitignore` and stay local:

- `.env.*` files (credentials), except `.env.example`
- `node_modules/`, `allure-report/`, `allure-results/`, `playwright-report/`, `test-results/`, `reports/`
- Scope and coverage spreadsheets (`*.xlsx`)
- `src/fixtures/data/uatOpportunities.json`, environment-specific record IDs
- `.auth/`, saved login sessions

## License

ISC. Maintained by TechnoIdentity.

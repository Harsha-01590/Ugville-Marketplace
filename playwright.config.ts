import { defineConfig, devices } from '@playwright/test';
import { envConfig } from './src/config/env.config';

/**
 * Ugville Automation — Playwright Configuration
 *
 * Environment: selected by the ENV variable (qa | uat | staging). Each maps to
 * a .env.<ENV> file (see .env.example); BASE_URL and credentials come from
 * there, so the same suite runs unchanged against any environment. QA is the
 * default when ENV is unset — plain `npx playwright test` runs against QA:
 *   npx playwright test          (defaults to QA)
 *   ENV=uat npx playwright test  (explicit override)
 * Structure: Module-based POM (Page Object Model) under src/modules/*.
 * Tests live separately from the modules, under src/tests/<module>/,
 * mirroring each module by name, with cross-module suites (a11y, api,
 * e2e, visual regression, layout) under src/tests/cross-cutting/.
 *
 * BDD (Gherkin .feature files, playwright-bdd) was removed 2026-10-07; the
 * old features/steps are kept in bdd_backup_20261007/ in case it comes back.
 *
 * @see https://playwright.dev/docs/test-configuration
 *
 * Project matrix:
 *   chrome          — default; always runs
 *   firefox         — opt-in via CROSS_BROWSER=1 or --project=firefox
 *   webkit          — opt-in via CROSS_BROWSER=1 or --project=webkit
 *   mobile-chrome   — opt-in via MOBILE=1 or --project=mobile-chrome
 *   a11y            — accessibility suite; always runs
 *   visual          — screenshot regression; opt-in via VISUAL=1
 */

const crossBrowser = !!process.env.CROSS_BROWSER;
const mobile = !!process.env.MOBILE;
const visual = !!process.env.VISUAL;
const fullSuite = !!process.env.FULL_SUITE;
const prioritySuite = process.env.PRIORITY_SUITE;

/* Report output locations — overridable so a module-by-module run (see
 * scripts/run-regression-by-module.mjs) can give each module its own
 * folder instead of every run overwriting the same allure-results/
 * playwright-report/reports directories. */
const allureResultsDir = process.env.ALLURE_RESULTS_DIR || 'allure-results';
const htmlReportDir = process.env.PLAYWRIGHT_HTML_REPORT_DIR || 'playwright-report';
const excelReportDir = process.env.EXCEL_REPORT_DIR || 'reports';

/* Maximize the Chrome window instead of using a fixed viewport when running --headed,
 * so tests are easy to watch. Skipped for the visual project, which relies on a fixed
 * viewport for stable screenshot comparisons.
 *
 * Playwright reloads this config file fresh inside each worker process, whose own
 * process.argv is just its internal entry script — not the original CLI invocation
 * — so `--headed` only shows up in argv here in the main process. Stash the result
 * in an env var so worker processes (which inherit the parent's env) see it too. */
const isHeaded = process.argv.includes('--headed') || process.env.PW_HEADED === '1';
if (isHeaded) process.env.PW_HEADED = '1';

/* Headed Chromium args. --ozone-platform=x11 runs Chrome through XWayland on a
 * Wayland desktop: native Wayland forbids apps from positioning their own
 * windows, so the two-account suites' left/right tiling (src/utils/windowLayout.ts)
 * left both windows stacked at 0,0. Harmless on a plain X11 desktop. */
const HEADED_CHROMIUM_ARGS = ['--start-maximized', '--ozone-platform=x11'];

/* deviceScaleFactor can't be combined with viewport: null, so it's dropped
 * from the Desktop Chrome preset for headed runs (see the 'chrome' and
 * 'full-suite' projects below). */
const { deviceScaleFactor: desktopChromeScale, ...desktopChromeBase } = devices['Desktop Chrome'];

export default defineConfig({
  testDir: './src',
  // Files run alphabetically (workers: 1), so the NN- prefix on each spec under
  // src/tests/marketplace/ is the module run order — keep new specs numbered.
  testMatch: ['tests/**/*.spec.ts'],

  /* Increased timeout for Salesforce sandbox (slower than typical apps) */
  timeout: 120_000,

  expect: {
    timeout: 15_000,
    /* Visual regression tolerance: 0.2% pixel diff, max 50 differing pixels */
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.002,
      maxDiffPixels: 50,
      animations: 'disabled',
    },
  },

  /* Salesforce serial runs to avoid database locks and conflicts */
  fullyParallel: false,

  /* One worker to maintain sequential state in leads/ratings tests */
  workers: 2,

  /* Fail the build on CI if test.only is accidentally committed */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: htmlReportDir }],
    ['./src/reporters/excelReporter.ts', { outputDir: excelReportDir }],
    ['allure-playwright', { resultsDir: allureResultsDir, detail: true, suiteTitle: false }],
  ],

  globalSetup: './src/config/globalSetup.ts',

  use: {
    baseURL: envConfig.BASE_URL,

    navigationTimeout: 60_000,
    actionTimeout: 30_000,

    trace: 'retain-on-failure',
    screenshot: 'on',
    video: 'retain-on-failure',

    launchOptions: {
      // slowMo exists to make --headed runs watchable; it has no purpose in
      // headless runs and was previously applied unconditionally, adding
      // ~1.2s of dead time to every action across the whole suite.
      slowMo: isHeaded ? 1200 : 0,
    },
  },

  projects: [
    // ── Primary: Chrome desktop (always on) ──────────────────────────────
    {
      name: 'chrome',
      use: {
        ...desktopChromeBase,
        channel: 'chrome',
        ...(isHeaded
          ? { viewport: null, launchOptions: { slowMo: 1200, args: HEADED_CHROMIUM_ARGS } }
          : { deviceScaleFactor: desktopChromeScale }),
      },
      // All tests except visual-only run here by default.
      // fullRegressionSuite is always excluded here — it re-imports every other
      // spec file, so it must only run under the dedicated 'full-suite' project
      // below (see that project's comment for why).
      testIgnore: visual
        ? ['**/fullRegressionSuite*', '**/priority/**']
        : ['**/visualRegression*', '**/fullRegressionSuite*', '**/priority/**'],
    },

    // ── Cross-browser: Firefox (opt-in via CROSS_BROWSER=1) ─────────────
    ...(crossBrowser
      ? [
          {
            name: 'firefox',
            use: {
              ...devices['Desktop Firefox'],
              // Firefox is significantly slower than Chrome on Salesforce LWC;
              // disable slowMo to avoid compounding latency.
              launchOptions: { slowMo: 0 },
            },
            // Run only smoke + core regression tags on Firefox
            grep: /@smoke|@regression/,
            // Visual tests use Chrome baselines, skip on Firefox
            testIgnore: ['**/visualRegression*'],
          },
        ]
      : []),

    // ── Cross-browser: WebKit / Safari (opt-in via CROSS_BROWSER=1) ──────
    ...(crossBrowser
      ? [
          {
            name: 'webkit',
            use: {
              ...devices['Desktop Safari'],
              launchOptions: { slowMo: 0 },
            },
            grep: /@smoke|@regression/,
            testIgnore: ['**/visualRegression*'],
          },
        ]
      : []),

    // ── Mobile: Chrome on Pixel 5 viewport (opt-in via MOBILE=1) ─────────
    ...(mobile
      ? [
          {
            name: 'mobile-chrome',
            use: {
              ...devices['Pixel 5'],
              // Salesforce LWC on mobile can be very slow — give it more headroom
              navigationTimeout: 90_000,
              launchOptions: { slowMo: 800 },
            },
            // Mobile smoke + home/community modules only (limited mobile support)
            grep: /@smoke|@Community|@Learning|@Marketplace/,
            testIgnore: ['**/visualRegression*'],
          },
        ]
      : []),

    // ── Full regression suite (opt-in via FULL_SUITE=1) ──────────────────
    // A single entry-point spec that imports every other spec file, so
    // running just this one file executes the entire project's test cases
    // end-to-end. Isolated into its own project (rather than left in
    // 'chrome') because Playwright forbids one matched test file from
    // importing another matched test file in the same run — scoping it to
    // a project whose testMatch is *only* this file keeps every other spec
    // file out of the matched set, so the imports are legal.
    // Run with: FULL_SUITE=1 npx playwright test --project=full-suite
    ...(fullSuite
      ? [
          {
            name: 'full-suite',
            use: {
              ...desktopChromeBase,
              channel: 'chrome',
              ...(isHeaded
                ? { viewport: null, launchOptions: { slowMo: 1200, args: HEADED_CHROMIUM_ARGS } }
                : { deviceScaleFactor: desktopChromeScale }),
            },
            testMatch: ['**/fullRegressionSuite*'],
          },
        ]
      : []),

    // ── Priority suites (opt-in via PRIORITY_SUITE=high|medium|low|all) ───
    ...(prioritySuite === 'high' || prioritySuite === 'all'
      ? [
          {
            name: 'priority-high',
            use: {
              ...desktopChromeBase,
              channel: 'chrome',
              ...(isHeaded
                ? { viewport: null, launchOptions: { slowMo: 1200, args: HEADED_CHROMIUM_ARGS } }
                : { deviceScaleFactor: desktopChromeScale }),
            },
            // priority/ lives at the repo root, not under the global testDir
            // ('./src'), so this project needs its own testDir to find it.
            testDir: '.',
            testMatch: ['priority/high/highPrioritySuite.spec.ts'],
          },
        ]
      : []),
    ...(prioritySuite === 'medium' || prioritySuite === 'all'
      ? [
          {
            name: 'priority-medium',
            use: {
              ...desktopChromeBase,
              channel: 'chrome',
              ...(isHeaded
                ? { viewport: null, launchOptions: { slowMo: 1200, args: HEADED_CHROMIUM_ARGS } }
                : { deviceScaleFactor: desktopChromeScale }),
            },
            // priority/ lives at the repo root, not under the global testDir
            // ('./src'), so this project needs its own testDir to find it.
            testDir: '.',
            testMatch: ['priority/medium/mediumPrioritySuite.spec.ts'],
          },
        ]
      : []),
    ...(prioritySuite === 'low' || prioritySuite === 'all'
      ? [
          {
            name: 'priority-low',
            use: {
              ...desktopChromeBase,
              channel: 'chrome',
              ...(isHeaded
                ? { viewport: null, launchOptions: { slowMo: 1200, args: HEADED_CHROMIUM_ARGS } }
                : { deviceScaleFactor: desktopChromeScale }),
            },
            // priority/ lives at the repo root, not under the global testDir
            // ('./src'), so this project needs its own testDir to find it.
            testDir: '.',
            testMatch: ['priority/low/lowPrioritySuite.spec.ts'],
          },
        ]
      : []),

    // ── Visual regression (opt-in via VISUAL=1) ───────────────────────────
    ...(visual
      ? [
          {
            name: 'visual',
            use: {
              ...devices['Desktop Chrome'],
              channel: 'chrome',
              // Disable slowMo for visual captures to avoid timer-driven animations
              launchOptions: { slowMo: 0 },
            },
            testMatch: ['**/visualRegression*'],
          },
        ]
      : []),
  ],
});

import { Page, Locator, expect } from '@playwright/test';
import { Logger } from '../../../utils/logger';

/**
 * BasePage — common functionality shared by all page objects.
 *
 * Every Page Object extends this class, so anything added here affects the
 * whole framework. Keep it to generic, cross-module helpers only — page- or
 * flow-specific logic belongs on the specific Page Object instead.
 *
 * Provides:
 * - Salesforce spinner wait helpers
 * - Resilient click utilities for SLDS components
 * - Common navigation patterns
 */
export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ==================== Spinner Helpers ====================

  /** Wait for all Salesforce Lightning spinners to disappear */
  async waitForSpinner(timeout = 20000): Promise<void> {
    const spinner = this.page.locator('lightning-spinner').first();
    // Only wait if the spinner is actually present/visible to avoid aborting calls during transitions
    if (await spinner.isVisible().catch(() => false)) {
      await spinner.waitFor({ state: 'hidden', timeout }).catch(() => { });
    }
  }

  /** Wait for page to stabilize after Salesforce operations */
  async waitForStabilization(ms = 3000): Promise<void> {
    await this.waitForSpinner();
    await this.page.waitForTimeout(ms);
  }

  /**
   * `Locator.isVisible()` checks the DOM once and returns immediately — it does
   * not poll, so it's the wrong tool for "wait up to N ms for this to appear"
   * (content loading asynchronously inside an iframe, a slow LWC re-render,
   * etc. will read as absent even though it shows up a moment later). This
   * actively polls via `waitFor()` instead, which is what most "getXVisible"
   * checks actually want.
   */
  async isEventuallyVisible(locator: Locator, timeout = 10000): Promise<boolean> {
    return locator.waitFor({ state: 'visible', timeout }).then(() => true, () => false);
  }

  /**
   * Like `isEventuallyVisible`, but for content that's legitimately in the DOM
   * without being visually rendered — e.g. a screen-reader-only rating label
   * next to a purely graphical star widget. Polls `count()` instead of
   * requiring CSS visibility.
   */
  async isEventuallyPresent(locator: Locator, timeout = 10000): Promise<boolean> {
    return locator.waitFor({ state: 'attached', timeout }).then(() => true, () => false);
  }

  /**
   * For lists that render progressively (first item appears, then more stream
   * in over the next second or two) — polls `count()` until it stops changing
   * for `quietMs`, instead of counting whatever happens to be there the
   * instant the first item becomes visible.
   */
  async stableCount(locator: Locator, quietMs = 1200, maxWaitMs = 15000): Promise<number> {
    const deadline = Date.now() + maxWaitMs;
    let last = await locator.count().catch(() => 0);
    let stableSince = Date.now();
    while (Date.now() < deadline) {
      await this.page.waitForTimeout(300);
      const current = await locator.count().catch(() => 0);
      if (current !== last) {
        last = current;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= quietMs) {
        break;
      }
    }
    return last;
  }

  // ==================== Resilient Click Helpers ====================

  /**
   * Click `clickTarget`, then check `guardLocator` to confirm the click worked
   * (e.g. a dropdown option or panel that should now be visible). Salesforce
   * Lightning components occasionally swallow the first click while they're
   * still rendering, so this retries the click — up to `maxRetries` times —
   * until the guard element shows up.
   */
  async resilientClick(
    clickTarget: Locator,
    guardLocator: Locator,
    options: { maxRetries?: number; waitMs?: number; force?: boolean } = {},
  ): Promise<void> {
    const { maxRetries = 4, waitMs = 1500, force = true } = options;

    for (let i = 0; i < maxRetries; i++) {
      await clickTarget.click({ force });
      await this.page.waitForTimeout(waitMs);
      if (await guardLocator.isVisible()) {
        return;
      }
      Logger.warn(`Retrying click (attempt ${i + 1}/${maxRetries})...`);
    }

    throw new Error(
      `Failed after ${maxRetries} attempts: guard element did not appear.`,
    );
  }

  /**
   * Closes any stray SLDS modal currently open on the page — e.g. Salesforce's
   * periodic unprompted "Reminders" dialog. Left open, a modal's `slds-modal`
   * overlay intercepts pointer events for every click anywhere on the page.
   * Safe no-op when no modal is open. Shared by `ModalComponent.closeAnyOpenModal()`
   * (run once before each test via the `_dismissStrayModal` auto-fixture) and by
   * `clickDismissingStrayModal()` below, which also guards against a modal
   * popping up mid-test, after that pre-test check already ran.
   */
  async closeStrayModalIfOpen(): Promise<void> {
    const modal = this.page.locator('.slds-modal, [role="dialog"]').first();
    if (!(await modal.isVisible().catch(() => false))) return;

    const closeBtn = modal.getByRole('button', { name: 'Close' }).first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ force: true }).catch(() => {});
    } else {
      await this.page.keyboard.press('Escape').catch(() => {});
    }
    await modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  /**
   * Clicks `target`, closing any stray modal first. If the click still times
   * out (a modal popped up between the check and the click — e.g. Salesforce's
   * periodic "Reminders" dialog appearing right after a navigation), closes
   * whatever appeared and retries, instead of failing the whole test.
   */
  async clickDismissingStrayModal(target: Locator, maxRetries = 3): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      await this.closeStrayModalIfOpen();
      try {
        await target.click({ timeout: 10000 });
        return;
      } catch (err) {
        if (i === maxRetries - 1) throw err;
        Logger.warn(`Click intercepted (likely a stray modal) — retrying after dismiss (attempt ${i + 1}/${maxRetries})...`);
      }
    }
  }

  /**
   * Select an option from an SLDS combobox/dropdown.
   * Handles both text-input comboboxes and button-based comboboxes.
   */
  async selectComboboxOption(
    combobox: Locator,
    optionText: string | RegExp,
    options: { pressSequentially?: string; delay?: number } = {},
  ): Promise<void> {
    await combobox.click({ force: true });

    if (options.pressSequentially) {
      await combobox.pressSequentially(options.pressSequentially, {
        delay: options.delay || 100,
      });
    }

    await this.page.waitForTimeout(1000);

    const option = this.page
      .locator(
        '.slds-listbox__option, [role="option"], lightning-base-combobox-item',
      )
      .filter({ hasText: optionText })
      .first();

    await option.waitFor({ state: 'visible', timeout: 30000 });
    await option.click({ force: true });
  }

  // ==================== Form Helpers ====================

  /**
   * Fill a date input (MM/DD/YYYY, `daysAhead` from today) only if it's
   * currently empty — several Salesforce stage forms (Contract, Closing,
   * Buy Closing) pre-populate their date fields, and this treats an
   * already-populated field as satisfied rather than overwriting it.
   */
  async fillDateFieldIfEmpty(
    input: Locator,
    label: string,
    daysAhead: number,
  ): Promise<string | null> {
    try {
      await input.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      Logger.info(`${label}: input not rendered — skipping`);
      return null;
    }
    const current = ((await input.inputValue().catch(() => '')) || '').trim();
    if (current.length > 0) {
      Logger.info(`${label}: already populated with "${current}", leaving as is`);
      return current;
    }
    const future = new Date();
    future.setDate(future.getDate() + daysAhead);
    const mm = String(future.getMonth() + 1).padStart(2, '0');
    const dd = String(future.getDate()).padStart(2, '0');
    const yyyy = future.getFullYear();
    const formatted = `${mm}/${dd}/${yyyy}`;
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await input.fill(formatted);
    await input.press('Tab');
    Logger.info(`${label}: was empty, entered "${formatted}"`);
    return formatted;
  }

  /**
   * Fills an input only when it is currently empty. Returns the value that
   * ended up in the field (existing value if preserved, or the new value).
   * Logs which path was taken so test output is self-explanatory.
   */
  async fillIfEmpty(locator: Locator, label: string, value: string): Promise<string> {
    await locator.waitFor({ state: 'visible', timeout: 30000 });
    await locator.scrollIntoViewIfNeeded();
    const current = (await locator.inputValue()).trim();
    if (current.length > 0) {
      Logger.info(`  -> ${label}: already populated with "${current}", leaving as is`);
      return current;
    }
    await locator.fill(value);
    Logger.info(`  -> ${label}: was empty, entered "${value}"`);
    return value;
  }

  /** Reads a date input value by `name` attribute (empty when not rendered). */
  async getNamedDateValue(name: string): Promise<string> {
    const input = this.page.locator(`input[name="${name}"]`).first();
    if ((await input.count()) === 0) return '';
    return ((await input.inputValue().catch(() => '')) || '').trim();
  }

  /**
   * Generic Salesforce date-input setter, idempotent. Targets `input[name=X]`
   * directly so it works for any datepicker (Appointment Attended, Contract
   * Executed, Estimated Buy Close Date, Hold Start Date, etc.). Format:
   * "MMM D, YYYY" (Salesforce default for the en-US locale).
   */
  async setNamedDateIfEmpty(
    name: string,
    humanLabel: string,
    daysAhead: number,
  ): Promise<string | null> {
    const input = this.page.locator(`input[name="${name}"]`).first();
    try {
      await input.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      Logger.info(`  -> ${humanLabel}: input not rendered — skipping`);
      return null;
    }
    const current = ((await input.inputValue().catch(() => '')) || '').trim();
    if (current.length > 0) {
      Logger.info(`  -> ${humanLabel}: already populated with "${current}", leaving as is`);
      return current;
    }
    const future = new Date();
    future.setDate(future.getDate() + daysAhead);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formatted = `${months[future.getMonth()]} ${future.getDate()}, ${future.getFullYear()}`;
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await input.fill(formatted);
    await input.press('Tab');
    Logger.info(`  -> ${humanLabel}: was empty, entered "${formatted}"`);
    return formatted;
  }

  // ==================== Combobox & Lookup Helpers ====================

  /**
   * Opens the dropdown bound to a Salesforce combobox button and returns a
   * locator that ONLY targets the options inside that combobox's listbox.
   * This avoids the trap where page.getByRole('option') matches stray
   * options elsewhere on the page (sidebar, global search, etc.) and
   * accidentally navigates the browser away.
   */
  async openComboboxOptions(comboboxButton: Locator): Promise<{ options: Locator; listboxId: string }> {
    await comboboxButton.waitFor({ state: 'visible', timeout: 30000 });
    await comboboxButton.scrollIntoViewIfNeeded();
    await comboboxButton.click();

    const listboxId = await comboboxButton.getAttribute('aria-controls');
    if (!listboxId) {
      throw new Error('Combobox button is missing aria-controls; cannot scope options safely');
    }
    const options = this.page.locator(`#${listboxId} [role="option"]`);
    await expect.poll(async () => options.count(), { timeout: 15000 }).toBeGreaterThan(0);
    return { options, listboxId };
  }

  /** Closes a dropdown by pressing Escape. Safe to call even if it's already closed. */
  async closeDropdown() {
    await this.page.keyboard.press('Escape').catch(() => {});
  }

  /**
   * Clicks a Salesforce lookup input WITHOUT typing — Salesforce will render
   * a list of recent/suggested entries — and picks the first one. Tries multiple
   * scoping strategies for the option list (aria-controls, combobox ancestor,
   * form-element ancestor) and returns the picked entry's text.
   */
  async clickInputAndPickFirstSuggestion(input: Locator): Promise<string> {
    await input.waitFor({ state: 'visible', timeout: 30000 });
    await input.scrollIntoViewIfNeeded();
    // Focus + click to trigger the suggestion popup. A second click sometimes
    // helps Salesforce re-render the suggestions when the field was already focused.
    await input.click();
    await input.click().catch(() => {});

    const listboxId = await input.getAttribute('aria-controls');
    const candidates: Locator[] = [];
    if (listboxId) candidates.push(this.page.locator(`#${listboxId} [role="option"]`));
    candidates.push(
      input.locator(
        'xpath=ancestor::*[self::lightning-grouped-combobox or self::lightning-base-combobox or contains(@class,"slds-combobox_container") or @role="combobox"][1]//*[@role="option"]'
      )
    );
    candidates.push(
      input.locator(
        'xpath=ancestor::*[contains(@class,"slds-form-element") or contains(@class,"slds-accordion__section")][1]//*[@role="option"]'
      )
    );

    let options: Locator | null = null;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      for (const cand of candidates) {
        if ((await cand.count()) > 0) { options = cand; break; }
      }
      if (options) break;
      await this.page.waitForTimeout(250);
    }
    if (!options) {
      throw new Error(
        `No suggestions appeared after clicking the lookup input. ` +
          `aria-controls=${listboxId ?? 'none'}.`
      );
    }

    const first = options.first();
    const picked = (await first.innerText()).trim();
    await first.click();
    await this.closeDropdown();
    return picked;
  }

  /**
   * Types a query into a Salesforce lookup/autocomplete input and clicks the
   * first matching option from THAT input's listbox (resolved via aria-controls).
   * Avoids page-wide getByRole('option') which can match unrelated nav items.
   */
  async searchLookupAndPickFirst(input: Locator, query: string): Promise<string> {
    await input.waitFor({ state: 'visible', timeout: 30000 });
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await input.fill('');
    await input.type(query, { delay: 80 });

    // Try multiple scoping strategies in order of preference. Salesforce LWC
    // sometimes renders the listbox inside the input's combobox container,
    // sometimes in a sibling, and sometimes in a portal referenced via
    // aria-controls. We pick whichever finds at least one option first.
    const listboxId = await input.getAttribute('aria-controls');
    const candidateLocators: Locator[] = [];
    if (listboxId) {
      candidateLocators.push(this.page.locator(`#${listboxId} [role="option"]`));
    }
    // The combobox container that wraps the input
    candidateLocators.push(
      input.locator(
        'xpath=ancestor::*[self::lightning-grouped-combobox or self::lightning-base-combobox or contains(@class,"slds-combobox_container") or @role="combobox"][1]//*[@role="option"]'
      )
    );
    // The closest form element / accordion section
    candidateLocators.push(
      input.locator(
        'xpath=ancestor::*[contains(@class,"slds-form-element") or contains(@class,"slds-accordion__section")][1]//*[@role="option"]'
      )
    );

    let options: Locator | null = null;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      for (const cand of candidateLocators) {
        if ((await cand.count()) > 0) {
          options = cand;
          break;
        }
      }
      if (options) break;
      await this.page.waitForTimeout(250);
    }
    if (!options) {
      throw new Error(
        `No options appeared for lookup query "${query}". ` +
          `Tried aria-controls=${listboxId ?? 'none'} and combobox/form-element ancestor scopes.`
      );
    }

    let first = options.first();
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const opt = options.nth(i);
      const text = (await opt.innerText().catch(() => '')).trim();
      if (text && !/^(search|show all|new |add |create |show more)/i.test(text)) {
        first = opt;
        break;
      }
    }

    const picked = (await first.innerText()).trim();
    await first.click();
    await this.closeDropdown();
    return picked;
  }

  /**
   * Types a query into a text-input combobox/lookup and clicks a RANDOM
   * option from its listbox (scoped via aria-controls, same approach as
   * `searchLookupAndPickFirst`). Used where the exact address/value doesn't
   * matter, only that a valid one gets picked. Returns the picked option's text.
   *
   * `filter`, if given, restricts the random pick to options whose text
   * passes the predicate — falling back to the full list if nothing matches.
   * (E.g. address results without a house number, like "County Road 43C,
   * Gunnison, CO, USA", can fail to populate property fields downstream.)
   */
  async searchAndPickRandomOption(
    input: Locator,
    query: string,
    filter?: (text: string) => boolean,
  ): Promise<string> {
    await input.waitFor({ state: 'visible', timeout: 30000 });
    await input.scrollIntoViewIfNeeded();
    await input.click();
    await input.fill('');
    await input.pressSequentially(query, { delay: 80 });

    const listboxId = await input.getAttribute('aria-controls');
    if (!listboxId) {
      throw new Error('Combobox input is missing aria-controls; cannot scope options safely');
    }
    const options = this.page.locator(`#${listboxId} [role="option"]`);
    await expect.poll(async () => options.count(), { timeout: 15000 }).toBeGreaterThan(0);

    const texts = (await options.allInnerTexts()).map(t => t.trim());
    let candidateIndices = texts.map((_, i) => i);
    if (filter) {
      const filtered = candidateIndices.filter(i => filter(texts[i]));
      if (filtered.length > 0) candidateIndices = filtered;
    }

    const index = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
    const picked = texts[index];
    await options.nth(index).click();
    await this.closeDropdown();
    return picked;
  }

  /**
   * Picks an option from a combobox. If `option` is provided, the matching
   * option is selected (case-insensitive, trimmed). Otherwise a random
   * non-"None" option is chosen.
   */
  async pickComboboxOption(
    comboboxButton: Locator,
    option: string | undefined,
    fieldLabel: string
  ): Promise<string> {
    // Read the current value first; if it already matches the requested option,
    // skip the click entirely. Re-clicking the same option in some Salesforce
    // LWC comboboxes triggers side-effects (e.g. journey re-evaluation) that
    // can navigate the page away.
    if (option && option.trim().length > 0) {
      const currentText = ((await comboboxButton.innerText().catch(() => '')) || '').trim();
      const currentDataValue = ((await comboboxButton.getAttribute('data-value')) || '').trim();
      const wanted = option.trim();
      const matches =
        currentText.localeCompare(wanted, undefined, { sensitivity: 'accent' }) === 0 ||
        currentDataValue.localeCompare(wanted, undefined, { sensitivity: 'accent' }) === 0;
      if (matches) {
        Logger.info(
          `  -> ${fieldLabel}: already set to "${currentText || currentDataValue}", skipping re-select`
        );
        return currentText || wanted;
      }
    }

    // Live-verified (2026-08-20): long listboxes (e.g. Tasks List's 14-option
    // view picker) intermittently fail the final click — the target option
    // resolves but never reports visible, even after `scrollIntoViewIfNeeded()`
    // below. Re-ran the identical flow standalone immediately after and it
    // passed clean, so this isn't a fixed locator bug — it's this Salesforce
    // sandbox occasionally lagging under load (same class of issue already
    // documented on `TasksListPage.clickNewTask()`). Retrying the whole
    // open-dropdown-and-pick cycle absorbs that instead of failing outright.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.pickComboboxOptionOnce(comboboxButton, option, fieldLabel);
      } catch (err) {
        if (attempt === 3) throw err;
        Logger.warn(`  -> ${fieldLabel}: pick attempt ${attempt} failed (${(err as Error).message}); retrying...`);
        await this.closeDropdown();
      }
    }
    // Unreachable — the loop above always returns or throws.
    throw new Error(`pickComboboxOption(${fieldLabel}): exhausted retries`);
  }

  private async pickComboboxOptionOnce(
    comboboxButton: Locator,
    option: string | undefined,
    fieldLabel: string
  ): Promise<string> {
    const { options } = await this.openComboboxOptions(comboboxButton);

    // Read the visible options up front so we can do a smart match without
    // hanging on a non-existent option.
    const allTexts = (await options.allInnerTexts()).map(t => t.trim());
    const indexed = allTexts.map((t, i) => ({ t, i }));

    const findIndex = (predicate: (t: string) => boolean) => indexed.find(o => predicate(o.t))?.i ?? -1;

    let pickedIndex = -1;
    let pickedText = '';

    if (option && option.trim().length > 0) {
      const wanted = option.trim().toLowerCase();
      // exact match -> contains match -> first non-NONE fallback
      pickedIndex = findIndex(t => t.toLowerCase() === wanted);
      if (pickedIndex < 0) pickedIndex = findIndex(t => t.toLowerCase().includes(wanted));
      if (pickedIndex < 0) {
        pickedIndex = findIndex(t => !!t && !/^-?-?\s*none\s*-?-?$/i.test(t));
        if (pickedIndex >= 0) {
          Logger.info(
            `  -> ${fieldLabel}: requested "${option}" not in dropdown ` +
              `[${allTexts.join(' | ')}]; falling back to "${allTexts[pickedIndex]}"`
          );
        }
      }
    } else {
      const candidates = indexed.filter(o => o.t && !/^-?-?\s*none\s*-?-?$/i.test(o.t));
      if (candidates.length > 0) {
        const r = candidates[Math.floor(Math.random() * candidates.length)];
        pickedIndex = r.i;
      }
    }

    if (pickedIndex < 0) {
      await this.closeDropdown();
      throw new Error(
        `No selectable option found for ${fieldLabel}. Visible options: [${allTexts.join(' | ')}]`
      );
    }

    pickedText = allTexts[pickedIndex];
    const target = options.nth(pickedIndex);
    // Live-verified (2026-08-19): long listboxes (e.g. Tasks List's 14-option
    // view picker) can resolve an option that exists in the DOM but sits
    // below the listbox's own scroll viewport — Playwright's click then
    // retries "waiting for element to be visible" indefinitely since the
    // element truly isn't. Scrolling it into view first fixes that; it's a
    // no-op when already visible.
    await target.scrollIntoViewIfNeeded();
    await target.click();
    // Make sure the dropdown is fully closed before the next action runs
    await this.closeDropdown();
    return pickedText;
  }

  // ==================== Accordion Helpers ====================

  /** Locator for an accordion summary span by its title attribute */
  accordionSummary(title: string): Locator {
    return this.page.locator(`span.slds-accordion__summary-content[title="${title}"]`).first();
  }

  /** Body container for an accordion, used to scope queries inside that section */
  accordionBody(title: string): Locator {
    // Walk up from the summary span to the closest accordion section/li
    return this.accordionSummary(title)
      .locator(
        'xpath=ancestor::*[contains(@class,"slds-accordion__section") or contains(@class,"slds-accordion__list-item") or self::section][1]'
      );
  }

  /**
   * Expands an accordion by clicking its title — but only when the section
   * is currently collapsed. SLDS marks an open accordion with the
   * `slds-is-open` class on the section container (or `aria-expanded="true"`
   * on the summary button). Clicking an already-open section would COLLAPSE
   * it, which is exactly the bug we are guarding against.
   */
  async expandAccordion(title: string) {
    const summary = this.accordionSummary(title);
    await summary.waitFor({ state: 'visible', timeout: 30000 });
    await summary.scrollIntoViewIfNeeded();

    // Detect "expanded" via the ancestor section's class or the summary
    // button's aria-expanded attribute.
    const checkOpen = () =>
      summary
        .evaluate((el) => {
          const section = (el as HTMLElement).closest(
            '.slds-accordion__section, .slds-accordion__list-item, section'
          );
          if (section?.classList.contains('slds-is-open')) return true;
          const btn = section?.querySelector('button[aria-expanded]') as HTMLButtonElement | null;
          if (btn?.getAttribute('aria-expanded') === 'true') return true;
          return false;
        })
        .catch(() => false);

    if (await checkOpen()) {
      Logger.info(`  [expandAccordion] "${title}" is already expanded — skipping click`);
      return;
    }

    // Click can occasionally miss (e.g. a sibling accordion's collapse
    // animation still settling), leaving the section closed and every
    // subsequent field-fill inside it waiting 30s for something that never
    // renders — so confirm the click actually opened it, retrying once.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await summary.click();
      await this.page.waitForTimeout(600);
      if (await checkOpen()) return;
      Logger.info(`  [expandAccordion] "${title}" did not open after click (attempt ${attempt}/2)`);
    }
  }

  // ==================== Validation Error Helpers ====================

  /**
   * Returns all visible validation error messages on the page.
   * Salesforce renders errors as toast notifications or inline help text.
   */
  async getValidationErrors(): Promise<string[]> {
    const errors: string[] = [];

    // Toast error messages
    const toasts = this.page.locator('.toastMessage, .slds-notify__content, [class*="toast-message"]');
    const toastCount = await toasts.count();
    for (let i = 0; i < toastCount; i++) {
      const text = ((await toasts.nth(i).textContent().catch(() => '')) ?? '').trim();
      if (text) errors.push(text);
    }

    // Inline validation errors (help text under fields)
    const helpTexts = this.page.locator('.slds-form-element__help, [data-error-message], .slds-has-error .slds-form-element__help');
    const helpCount = await helpTexts.count();
    for (let i = 0; i < helpCount; i++) {
      const text = ((await helpTexts.nth(i).textContent().catch(() => '')) ?? '').trim();
      if (text) errors.push(text);
    }

    return errors;
  }

  /**
   * Returns true if any validation error is currently displayed on the page.
   */
  async hasValidationErrors(): Promise<boolean> {
    const errors = await this.getValidationErrors();
    return errors.length > 0;
  }

  /**
   * Asserts that at least one validation error is displayed.
   * Useful for negative testing — verifying that empty mandatory fields
   * prevent form submission.
   */
  async expectValidationErrorVisible() {
    // Wait a moment for any toast to appear
    await this.page.waitForTimeout(2000);

    const hasErrors = await this.hasValidationErrors();
    if (!hasErrors) {
      // Also check for generic error indicators
      const errorBorder = this.page.locator('.slds-has-error').first();
      const hasErrorBorder = await errorBorder.isVisible().catch(() => false);
      expect(
        hasErrorBorder,
        'A validation error (toast, inline help, or error border) should be visible'
      ).toBe(true);
    }
  }

  /**
   * Helper to read the current active stage name from the Salesforce SLDS Path chevron component.
   */
  async getActiveStageFromPath(timeoutMs = 8000): Promise<string> {
    // Primary: custom LWC listbox path — the selected option has [aria-selected="true"]
    const selectedOption = this.page.locator('listbox [role="option"][aria-selected="true"], listbox option[selected]').first();
    // Fallback: standard SLDS path chevron
    const activePathItem = this.page.locator('.slds-path__item.slds-is-current').first();

    try {
      // Try the listbox option first (used in UGville custom community)
      await selectedOption.waitFor({ state: 'visible', timeout: timeoutMs }).catch(() => {});
      if (await selectedOption.isVisible().catch(() => false)) {
        const text = (await selectedOption.innerText().catch(() => '')).trim();
        return text.replace(/Stage\s+Complete/gi, '')
                   .replace(/Current\s+Stage/gi, '')
                   .replace(/\n+/g, ' ')
                   .trim();
      }

      // Fallback to standard SLDS path
      await activePathItem.waitFor({ state: 'visible', timeout: Math.min(timeoutMs, 5000) });
      const text = (await activePathItem.innerText().catch(() => '')).trim();
      return text.replace(/Stage\s+Complete/gi, '')
                 .replace(/Current\s+Stage/gi, '')
                 .replace(/\n+/g, ' ')
                 .trim();
    } catch {
      return '';
    }
  }

  // ==================== Navigation Helpers ====================

  /** Reload page and wait for Salesforce to stabilize */
  async reloadAndWait(stabilizationMs = 5000): Promise<void> {
    await this.page.reload();
    await this.page.waitForLoadState('domcontentloaded');
    await this.waitForSpinner(25000);
    await this.page.waitForTimeout(stabilizationMs);
  }

  /**
   * The "Recently Visited Leads" sidebar can auto-open on some Salesforce
   * pages and overlap controls we need to click next. If it's open, close it
   * first; if it's already closed, this is a no-op.
   */
  async closeRecentlyVisitedLeadsIfOpen(): Promise<void> {
    const heading = this.page.getByRole('heading', { name: 'Recently Visited Leads', level: 1 });
    const button = this.page.getByRole('banner').getByText('Recently Visited Leads').first();
    
    const isOpen = await heading.evaluateAll(elements => {
      return elements.some(el => {
        const rect = el.getBoundingClientRect();
        return rect.left < window.innerWidth && rect.right > 0 && rect.width > 0 && rect.height > 0;
      });
    }).catch(() => false);

    if (isOpen) {
      Logger.info('Recently Visited Leads sidebar is open — closing it.');
      // The sidebar's close control isn't a plain button, and neither the image,
      // its parent, nor the text node reliably responds to a normal Playwright
      // click here — so we dispatch a click on all three (real .click() plus a
      // synthetic MouseEvent) and let whichever one the widget listens to fire.
      await button.evaluate(el => {
        const parent = el.parentElement;
        if (parent) {
          const img = parent.querySelector('img');
          if (img) {
            img.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
            if (typeof (img as any).click === 'function') {
              (img as any).click();
            }
          }
          parent.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
          if (typeof (parent as any).click === 'function') {
            (parent as any).click();
          }
        }
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
        if (typeof (el as any).click === 'function') {
          (el as any).click();
        }
      }).catch(() => {});
      
      await expect.poll(async () => {
        return await heading.evaluateAll(elements => {
          return elements.every(el => {
            const rect = el.getBoundingClientRect();
            return rect.left >= window.innerWidth || rect.width === 0;
          });
        }).catch(() => true);
      }, { timeout: 5000 }).toBe(true).catch(() => {});
    }
  }
}

import type { Page } from '@playwright/test';

/**
 * Headed Chromium runs only: snaps this page's browser window to the left or
 * right half of the screen, so two franchise sessions (each its own
 * BrowserContext = its own window) can be watched side by side. No-op when
 * headless or on Firefox/WebKit, which have no CDP window API.
 *
 * Needs headed Chromium on X11/XWayland (playwright.config.ts passes
 * --ozone-platform=x11): native Wayland ignores window positions. The window
 * manager also applies un-maximize asynchronously and can restore the old
 * size over bounds set too early, so the move is retried until it sticks.
 */
export async function tileWindow(page: Page, side: 'left' | 'right') {
  const browser = page.context().browser();
  if (process.env.PW_HEADED !== '1' || browser?.browserType().name() !== 'chromium') return;
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    // Usable screen area (excludes the top bar/dock).
    const screen = await page.evaluate(() => ({
      w: window.screen.availWidth,
      h: window.screen.availHeight,
      x: (window.screen as unknown as { availLeft?: number }).availLeft ?? 0,
      y: (window.screen as unknown as { availTop?: number }).availTop ?? 0,
    })).catch(() => ({ w: 1920, h: 1080, x: 0, y: 0 }));
    const half = Math.floor(screen.w / 2);
    const want = { left: screen.x + (side === 'left' ? 0 : half), top: screen.y, width: half, height: screen.h };

    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(300);
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: want });
      await page.waitForTimeout(300);
      const { bounds } = await cdp.send('Browser.getWindowBounds', { windowId });
      if (Math.abs((bounds.left ?? 0) - want.left) < 20 && Math.abs((bounds.width ?? 0) - want.width) < 20) break;
    }
    await cdp.detach();
  } catch (e) {
    // Cosmetic only — never fail a test over window placement.
    console.log(`  [windowLayout] could not tile ${side} window: ${(e as Error).message}`);
  }
}

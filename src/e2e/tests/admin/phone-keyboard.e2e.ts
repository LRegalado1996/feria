import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures";
import { AdminSettingsPage } from "../../page-objects/admin-settings.page";

// FER-053. On an iPhone the keyboard covers the bottom of the screen without
// shrinking the layout viewport, so the bar under the thumb has to ride above
// it, read from `window.visualViewport`. Chromium opens no keyboard, so these
// tests play one: an init script replaces `visualViewport` with a stand-in
// whose height the test shrinks, as Safari's shrinks when its keyboard opens.
// What this proves is the wiring in a real browser (the hook reading the
// visual viewport, the CSS moving the bar, the focused field kept clear of
// it); how Safari's own keyboard, its animation and its scrolling behave is
// checked on a real iPhone (the ticket's acceptance criterion).

const PHONE = { height: 812, width: 375 };
const KEYBOARD_HEIGHT = 336;

/** Opens or closes the played keyboard, as `visualViewport` reports it. */
async function setKeyboard(page: Page, height: number): Promise<void> {
  await page.evaluate((keyboard) => {
    window.dispatchEvent(new CustomEvent("e2e:keyboard", { detail: keyboard }));
  }, height);
}

/**
 * Before the page's own scripts: a `visualViewport` whose bottom is the
 * window's minus the played keyboard, telling its listeners when it changes,
 * as Safari's does on `resize`.
 */
async function playKeyboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let keyboard = 0;
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { get: () => window.innerHeight - keyboard },
      offsetLeft: { get: () => 0 },
      offsetTop: { get: () => 0 },
      pageLeft: { get: () => window.scrollX },
      pageTop: { get: () => window.scrollY },
      scale: { get: () => 1 },
      width: { get: () => window.innerWidth },
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      get: () => viewport,
    });
    window.addEventListener("e2e:keyboard", (event) => {
      keyboard = event instanceof CustomEvent ? Number(event.detail) : 0;
      viewport.dispatchEvent(new Event("resize"));
    });
  });
}

/**
 * Waits until the page has painted twice: the bar's hook measures and moves
 * it in the next animation frame after the visual viewport changed.
 */
async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
}

/** The visible bar's box, from the top of the window. */
async function barBox(page: Page) {
  return await page
    .getByTestId("admin-primary-action")
    .filter({ visible: true })
    .evaluate((bar) => {
      const box = bar.getBoundingClientRect();
      return { bottom: Math.round(box.bottom), top: Math.round(box.top) };
    });
}

test.describe("The bar under the thumb and the keyboard", () => {
  test.use({ viewport: PHONE });

  test("rides above the keyboard while a field has focus, keeps the field clear of it, and comes back down when the keyboard closes", async ({
    page,
  }) => {
    await playKeyboard(page);
    const settings = new AdminSettingsPage(page);
    await settings.open();
    expect(await barBox(page)).toMatchObject({ bottom: PHONE.height });
    // A field low on the screen, where the keyboard will be, with more of
    // the form under it: Chromium does not lengthen the page for a played
    // keyboard as Safari does for its own, so the very last field could not
    // scroll up here.
    const field = settings.field("Frase en inglés");
    await field.evaluate((element) => {
      window.scrollBy({ top: element.getBoundingClientRect().top - 600 });
    });
    await expect
      .poll(
        async () =>
          await field.evaluate((element) =>
            Math.round(element.getBoundingClientRect().top)
          )
      )
      .toBe(600);

    await field.focus();
    await setKeyboard(page, KEYBOARD_HEIGHT);

    const visibleBottom = PHONE.height - KEYBOARD_HEIGHT;
    // The bar ends where the keyboard starts.
    await expect
      .poll(async () => (await barBox(page)).bottom)
      .toBe(visibleBottom);
    const bar = await barBox(page);
    // The field is above the bar, whole.
    await expect
      .poll(
        async () =>
          await field.evaluate(
            (element) => element.getBoundingClientRect().bottom
          )
      )
      .toBeLessThanOrEqual(bar.top);
    expect(
      await field.evaluate((element) => element.getBoundingClientRect().top)
    ).toBeGreaterThanOrEqual(0);
    // The save is reachable where the bar now is: nothing covers it there.
    const save = settings.saveButton();
    expect(
      await save.evaluate((button) => button.getBoundingClientRect().bottom)
    ).toBeLessThanOrEqual(visibleBottom);
    await save.click({ trial: true });
    await expect(field).toBeFocused();

    await setKeyboard(page, 0);

    await expect
      .poll(async () => (await barBox(page)).bottom)
      .toBe(PHONE.height);
    await expect(
      page.getByTestId("admin-primary-action").filter({ visible: true })
    ).not.toHaveAttribute("data-keyboard");
  });

  test("moves the bar no further where the page already shrank for the keyboard, as Chrome on Android does", async ({
    page,
  }) => {
    await playKeyboard(page);
    const settings = new AdminSettingsPage(page);
    await settings.open();

    // `resizes-content`: the window itself loses the keyboard's height, and
    // the visual viewport with it.
    await page.setViewportSize({
      height: PHONE.height - KEYBOARD_HEIGHT,
      width: PHONE.width,
    });
    await setKeyboard(page, 0);
    await nextFrames(page);

    expect(await barBox(page)).toMatchObject({
      bottom: PHONE.height - KEYBOARD_HEIGHT,
    });
    await expect(
      page.getByTestId("admin-primary-action").filter({ visible: true })
    ).not.toHaveAttribute("data-keyboard");
  });

  test.describe("on a computer", () => {
    test.use({ viewport: { height: 800, width: 1280 } });

    test("keeps the main action in the top bar whatever the visual viewport says", async ({
      page,
    }) => {
      await playKeyboard(page);
      const settings = new AdminSettingsPage(page);
      await settings.open();
      const before = await barBox(page);
      await settings.field("Enlace de TikTok").focus();

      await setKeyboard(page, KEYBOARD_HEIGHT);
      await nextFrames(page);

      expect(await barBox(page)).toEqual(before);
      await expect(
        page.getByTestId("admin-primary-action").filter({ visible: true })
      ).not.toHaveAttribute("data-keyboard");
    });
  });
});

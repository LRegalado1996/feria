import { expect, type Locator } from "@playwright/test";

/**
 * Clicks `trigger` until `ready` is on screen, then never again. A first
 * click can land on a visible but not yet hydrated control and vanish;
 * re-clicking once `ready` is up would toggle a live menu or dialog closed, so
 * the retry fires only while `ready` is absent. Never use it on a submit: a
 * second submit double-commits. Both inner waits are bounded well below the
 * `toPass` budget, so a trigger consumed by navigation cannot stall the loop.
 */
export async function clickUntilVisible(
  trigger: Locator,
  ready: Locator
): Promise<void> {
  // One long wait for the trigger, outside the retry loop: on a saturated
  // runner the page itself can take many seconds to render, and spending that
  // as failed 5 s click attempts would exhaust the retry budget first.
  await expect(trigger).toBeVisible();
  await expect(async () => {
    if (!(await ready.isVisible())) {
      await trigger.click({ timeout: 5000 });
    }

    await expect(ready).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 60_000 });
}

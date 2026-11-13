import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Closed means unmounted, not hidden: assert the dialog and its overlay are
 * both gone before the next click or keystroke. Content and backdrop animate
 * out independently, a transparent overlay still intercepts clicks, and the
 * dialog's close autofocus runs late enough to steal focus from what comes
 * next.
 */
export async function expectDialogRemoved(
  page: Page,
  dialog: Locator
): Promise<void> {
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("dialog-overlay")).toHaveCount(0, {
    timeout: 15_000,
  });
}

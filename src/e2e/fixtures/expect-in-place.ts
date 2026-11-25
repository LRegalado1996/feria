import { expect, type Page, type Request } from "@playwright/test";

/**
 * Runs `action`, a link followed, and asserts the page changed in place:
 * no request loaded a whole new document into the tab (FER-064). A link
 * whose own handler never ran, because a panel closed under it first,
 * still reaches its address, but by loading the document again, which drops
 * what the app keeps mounted. `action` must wait for the page it leads to,
 * so a load it started has been requested by then.
 */
export async function expectInPlace(
  page: Page,
  action: () => Promise<void>
): Promise<void> {
  const loads: string[] = [];
  const record = (request: Request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      loads.push(request.url());
    }
  };
  page.on("request", record);

  try {
    await action();
  } finally {
    page.off("request", record);
  }

  expect(loads).toEqual([]);
}

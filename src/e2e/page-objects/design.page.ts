import { expect, type Locator } from "@playwright/test";

import { BasePage } from "./base.page";

/** The storefront's component gallery, hidden in production. */
export class DesignPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto("/design");
    await this.waitForLoad();
  }

  async gotoEnglish(): Promise<void> {
    await this.page.goto("/en/design");
    await this.waitForLoad();
  }

  protected loaded(): Locator {
    return this.getByTestId("design-page").filter({ visible: true }).first();
  }

  getSection(
    name:
      | "cards"
      | "chips"
      | "count-up"
      | "link"
      | "marquee"
      | "price"
      | "reveal"
      | "type"
  ): Locator {
    return this.getByTestId(`design-${name}`);
  }

  /** The first marquee's pause toggle (there is one per band). */
  getMarqueePause(): Locator {
    return this.getSection("marquee")
      .getByRole("button", { name: "Pausar la banda en movimiento" })
      .first();
  }

  getSliderTrack(): Locator {
    return this.getSection("cards").getByRole("region", {
      name: "Artículos de muestra",
    });
  }

  getSliderPosition(): Locator {
    // Hidden from assistive technology, so it has no role to find it by.
    return this.getSection("cards").getByText(/^\d+ \/ 6$/);
  }

  getReveal(): Locator {
    return this.getSection("reveal").getByTestId("design-reveal-block");
  }

  getCountUpFigure(): Locator {
    return this.getSection("count-up").getByTestId("design-count-up-figure");
  }

  /** The page is never wider than the window it is shown in. */
  async expectNoHorizontalScroll(): Promise<void> {
    await expect
      .poll(
        async () =>
          await this.page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth
          )
      )
      .toBe(0);
  }
}

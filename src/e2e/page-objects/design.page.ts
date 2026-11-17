import type { Locator } from "@playwright/test";

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
      | "banner"
      | "bubbles"
      | "buttons"
      | "cards"
      | "chips"
      | "count-up"
      | "cover"
      | "link"
      | "logo"
      | "marquee"
      | "palette"
      | "price"
      | "reveal"
      | "type"
  ): Locator {
    return this.getByTestId(`design-${name}`);
  }

  /** The row of sample articles: a carousel named after its heading. */
  getRow(): Locator {
    return this.getSection("cards").getByRole("region", { name: "Novedades" });
  }

  /**
   * How far the row's first card sits from the row's left edge, in whole
   * pixels: 0 at its start, below 0 once it moved on. Embla moves the track
   * with a transform, so the card's box tells, not a scroll position; the
   * card, not its slide, whose box holds the gap before it.
   */
  async firstCardOffset(): Promise<number> {
    const row = this.getRow();
    const [frame, card] = await Promise.all([
      row.boundingBox(),
      row.getByRole("article").first().boundingBox(),
    ]);

    return Math.round((card?.x ?? 0) - (frame?.x ?? 0));
  }

  /** The cover: banners that move on their own. */
  getCover(): Locator {
    return this.getSection("cover").getByRole("region", { name: "Portada" });
  }

  /** The first marquee's pause toggle (there is one per band). */
  getMarqueePause(): Locator {
    return this.getSection("marquee")
      .getByRole("button", { name: "Pausar la banda en movimiento" })
      .first();
  }

  /** The first marquee's moving track. */
  getMarqueeTrack(): Locator {
    return this.getSection("marquee")
      .getByTestId("store-marquee-track")
      .first();
  }

  getReveal(): Locator {
    return this.getSection("reveal").getByTestId("design-reveal-block");
  }

  getCountUpFigure(): Locator {
    return this.getSection("count-up").getByTestId("design-count-up-figure");
  }
}

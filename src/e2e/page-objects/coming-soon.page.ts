import { expect, type Locator } from "@playwright/test";

import { BasePage } from "./base.page";

/** The page every storefront address leads to while the store is closed. */
export class ComingSoonPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto("/coming-soon");
    await this.waitForLoad();
  }

  protected loaded(): Locator {
    return this.getByTestId("coming-soon-page")
      .filter({ visible: true })
      .first();
  }

  getBubblesButton(): Locator {
    return this.getButton("LR Market: hacer burbujas");
  }

  /** The layer of the burst in flight; it is replaced on every burst. */
  getBubbleLayer(): Locator {
    return this.getByTestId("store-bubbles-layer");
  }

  getCountdown(): Locator {
    return this.getByTestId("fair-countdown");
  }

  getMarqueeTrack(): Locator {
    return this.getByTestId("store-marquee-track");
  }

  getLocaleToggle(): Locator {
    return this.getByTestId("locale-toggle").filter({ visible: true });
  }

  /**
   * Presses the logo until a new burst is in flight: the button is in the
   * server's HTML before React owns it, and a press that lands first is lost.
   * Harmless to repeat: every press only starts another burst.
   */
  async blowBubbles(): Promise<void> {
    await expect(async () => {
      await this.getBubblesButton().click();
      await expect(this.getBubbleLayer()).not.toHaveAttribute(
        "data-burst",
        "0",
        { timeout: 1000 }
      );
    }).toPass();
  }
}

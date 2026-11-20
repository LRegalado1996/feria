import { expect, type Locator } from "@playwright/test";

import { clickUntilVisible } from "../fixtures/click-until-visible";
import {
  completeRpcAction,
  type RpcInput,
} from "../fixtures/complete-rpc-action";
import { AdminPage } from "./admin.page";

// The admin reads in Spanish, the language of an unprefixed URL.

/** The home's editor (`/admin/home`, FER-020, FER-060). */
export class AdminHomePage extends AdminPage {
  /**
   * Opens the screen and waits until React owns it: the order's save button
   * is enabled only once the page hydrated.
   */
  async open(): Promise<void> {
    // `/admin/home` leads to the editor of the page that is the home now
    // (FER-060), whatever its name: "Home" after `0025`, unless an admin
    // of a development database renamed it.
    await this.goto("/admin/home");
    await expect(this.page).toHaveURL(/\/admin\/pages\/\d+$/u);
    await expect(this.heading()).toBeVisible();
    await expect(this.saveOrderButton()).toBeEnabled();
  }

  /** The screen's main action, in the top bar (under the thumb on a phone). */
  saveOrderButton(): Locator {
    return this.getByTestId("admin-primary-action")
      .filter({ visible: true })
      .getByRole("button", { name: "Guardar orden" });
  }

  /** The announcement's card. */
  announcement(): Locator {
    return this.getByTestId("announcement-form");
  }

  /** A text field of the announcement, by its exact name. */
  announcementField(label: string): Locator {
    return this.announcement().getByRole("textbox", {
      exact: true,
      name: label,
    });
  }

  /**
   * Saves the announcement, waiting for `home.saveAnnouncement` to answer
   * with the fields in `input`, then for the screen to say it saved.
   */
  async saveAnnouncement(input: RpcInput = {}): Promise<void> {
    await completeRpcAction(
      this.page,
      "/api/orpc/page/saveAnnouncement",
      async () => {
        await this.announcement()
          .getByRole("button", { name: "Guardar anuncio" })
          .click();
      },
      { input }
    );
    await expect(this.page.getByText("Anuncio guardado.")).toBeVisible();
  }

  /** The banners' card. */
  banners(): Locator {
    return this.getByTestId("home-banners");
  }

  /** A banner of the list, by its title. */
  bannerRow(title: string): Locator {
    return this.getByTestId("home-banner-row").filter({ hasText: title });
  }

  /** The side sheet's banner form. */
  bannerForm(): Locator {
    return this.getByTestId("banner-form");
  }

  /** Opens a new banner's form: the first open after a load is repeated. */
  async openNewBanner(): Promise<void> {
    await clickUntilVisible(
      this.getByTestId("home-banner-add"),
      this.bannerForm()
    );
  }

  /**
   * Saves the banner form, waiting for `home.createBanner` to answer with
   * the fields in `input`, then for the screen to say it was added.
   */
  async saveNewBanner(input: RpcInput = {}): Promise<void> {
    await completeRpcAction(
      this.page,
      "/api/orpc/page/createBanner",
      async () => {
        await this.getByTestId("banner-form-submit").click();
      },
      { input }
    );
    await expect(this.page.getByText("Banner agregado.")).toBeVisible();
  }

  /** The article spotlights' card (FER-059). */
  spotlights(): Locator {
    return this.getByTestId("home-spotlights");
  }

  /** A spotlight of the list, by its article's name. */
  spotlightRow(name: string): Locator {
    return this.getByTestId("home-spotlight-row").filter({ hasText: name });
  }

  /** The side sheet's spotlight form. */
  spotlightForm(): Locator {
    return this.getByTestId("spotlight-form");
  }

  /** Opens a new spotlight's form: the first open after a load is repeated. */
  async openNewSpotlight(): Promise<void> {
    await clickUntilVisible(
      this.getByTestId("home-spotlight-add"),
      this.spotlightForm()
    );
  }

  /**
   * Saves the spotlight form, waiting for `page.createSpotlight` to answer
   * with the fields in `input`, then for the screen to say it was added.
   */
  async saveNewSpotlight(input: RpcInput = {}): Promise<void> {
    await completeRpcAction(
      this.page,
      "/api/orpc/page/createSpotlight",
      async () => {
        await this.getByTestId("spotlight-form-submit").click();
      },
      { input }
    );
    await expect(this.page.getByText("Vidriera agregada.")).toBeVisible();
  }

  /** The best sellers' card. */
  bestSellers(): Locator {
    return this.getByTestId("home-layout-best-sellers");
  }

  /** The best sellers in their order, one entry each. */
  bestSellerItems(): Locator {
    return this.getByTestId("home-layout-best-sellers-item");
  }

  /** Adds the published article named `title` to the best sellers. */
  async addBestSeller(title: string): Promise<void> {
    const card = this.bestSellers();
    await card
      .getByRole("combobox", { name: "Artículo para agregar" })
      .selectOption({ label: title });
    await card.getByRole("button", { exact: true, name: "Agregar" }).click();
    await expect(this.bestSellerItems().filter({ hasText: title })).toHaveCount(
      1
    );
  }

  /** Takes every article out of the best sellers, first to last. */
  async clearBestSellers(): Promise<void> {
    const items = this.bestSellerItems();

    for (let left = await items.count(); left > 0; left -= 1) {
      await items
        .first()
        .getByRole("button", { name: /^Quitar: / })
        .click();
      await expect(items).toHaveCount(left - 1);
    }
  }

  /**
   * Saves the home's order, waiting for `home.saveLayout` to answer, then for
   * the screen to say it saved.
   */
  async saveOrder(): Promise<void> {
    await completeRpcAction(
      this.page,
      "/api/orpc/page/saveLayout",
      async () => {
        await this.saveOrderButton().click();
      }
    );
    await expect(this.page.getByText("Orden guardado.")).toBeVisible();
  }

  /** The preview of the home, drawn by the storefront's pieces. */
  preview(): Locator {
    return this.getByTestId("store-page-preview");
  }

  /**
   * The name of the preview's spotlight featuring `title`: the heading of
   * the region it names. The preview is `inert`, out of the accessibility
   * tree, hence `includeHidden`.
   */
  previewSpotlightName(title: string): Locator {
    return this.preview()
      .getByRole("region", { includeHidden: true, name: title })
      .getByRole("heading", { includeHidden: true, name: title });
  }
}

import { expect, type Locator } from "@playwright/test";

import { expectDialogRemoved } from "../fixtures/expect-dialog-removed";
import { BasePage } from "./base.page";

/**
 * The store's home (`/`, English at `/en`), in the theme's colors: the site
 * is one store (FER-038). Its header and footer are on every store page.
 */
export class StorePage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto("/");
    await this.waitForLoad();
  }

  async gotoEnglish(): Promise<void> {
    await this.page.goto("/en");
    await this.waitForLoad();
  }

  protected loaded(): Locator {
    return this.getByTestId("store-home").filter({ visible: true }).first();
  }

  /**
   * The strip a signed-in admin sees over the store while it is closed to
   * the public (FER-034).
   */
  getPreviewNotice(): Locator {
    return this.getByTestId("store-preview-notice").filter({ visible: true });
  }

  /** The canvas every store page is painted on, in the theme's background. */
  getTheme(): Locator {
    return this.getByTestId("store-theme");
  }

  /**
   * The home's intro, where the store's name sits on the white page: only
   * a store with nothing else to show has one (FER-022).
   */
  getIntro(): Locator {
    return this.getByTestId("store-intro-header").filter({ visible: true });
  }

  /**
   * What the home shows under the header (FER-022): `data-kind` says
   * whether it is the curated home (`sections`) or the intro (`intro`).
   */
  getHomeView(): Locator {
    return this.getByTestId("store-home-view").filter({ visible: true });
  }

  /** The home's cover: its banners, a carousel when there are several. */
  getHomeCover(): Locator {
    return this.getByTestId("store-home-cover").filter({ visible: true });
  }

  /** The home's rows and banners under the cover, in their order. */
  getHomeSections(): Locator {
    return this.getByTestId("store-page-section").filter({ visible: true });
  }

  /** One of the home's rows or banners, by the heading it shows. */
  getHomeSection(heading: string): Locator {
    return this.getHomeSections().filter({
      has: this.page.getByRole("heading", {
        exact: true,
        level: 2,
        name: heading,
      }),
    });
  }

  /**
   * The `content` of the page's `<meta>` named `key` (`name` or
   * `property`), wherever Next streamed it: into `<head>` for a crawler,
   * into `<body>` for a browser (docs/agents/nextjs.md § Store pages).
   */
  async readMeta(key: string): Promise<string | null> {
    return await this.page.evaluate(
      (wanted) =>
        [...document.querySelectorAll("meta")]
          .find(
            (meta) =>
              meta.getAttribute("name") === wanted ||
              meta.getAttribute("property") === wanted
          )
          ?.getAttribute("content") ?? null,
      key
    );
  }

  /** The header every page of the store starts with (FER-021). */
  getSiteHeader(): Locator {
    return this.getByTestId("store-header").filter({ visible: true });
  }

  getFooter(): Locator {
    return this.getByTestId("store-footer").filter({ visible: true });
  }

  /** The cart's link in the header, named after its count. */
  getCartButton(): Locator {
    return this.getByTestId("store-cart-button").filter({ visible: true });
  }

  /**
   * The header's cart once React owns it, when a click opens the side panel
   * (FER-045); before then it is a plain link to the checkout page. It says
   * it opens a dialog only from then on, so that is what this waits for.
   */
  async getLiveCartButton(): Promise<Locator> {
    const button = this.getCartButton();
    await expect(button).toHaveAttribute("aria-haspopup", "dialog", {
      timeout: 60_000,
    });

    return button;
  }

  /** The cart's side panel (FER-045), while it is open. */
  getCartPanel(): Locator {
    return this.getByTestId("store-cart-panel").filter({ visible: true });
  }

  /** A line of the open side panel, by its article's title. */
  getCartPanelLine(title: string): Locator {
    return this.getCartPanel()
      .getByTestId("store-cart-line")
      .filter({ hasText: title });
  }

  /**
   * Closes the side panel with "Seguir comprando" and waits for it and its
   * scrim to be gone: closed is not removed (`src/e2e/AGENTS.md`).
   */
  async closeCartPanel(): Promise<void> {
    const panel = this.getCartPanel();
    await panel.getByRole("button", { name: "Seguir comprando" }).click();
    await expectDialogRemoved(this.page, panel);
  }

  /** The checkout's confirmation (FER-050), while it is open. */
  getCheckoutConfirm(): Locator {
    return this.getByTestId("store-checkout-confirm").filter({ visible: true });
  }

  /**
   * Submits the checkout's form, which asks first (FER-050), and waits for
   * the confirmation it opens.
   */
  async askToConfirmOrder(): Promise<Locator> {
    await this.getByTestId("store-checkout-submit")
      .filter({ visible: true })
      .click();
    const dialog = this.getCheckoutConfirm();
    await expect(dialog).toBeVisible();

    return dialog;
  }

  /**
   * Submits the checkout and confirms the order in the dialog: the whole
   * way to an order. Wrap it in `completeRpcAction`.
   */
  async submitAndConfirmOrder(): Promise<void> {
    const dialog = await this.askToConfirmOrder();
    await dialog.getByTestId("store-checkout-confirm-submit").click();
  }

  /**
   * The lime line above the header (FER-039): the store's announcement
   * (FER-020), the whole notice from `lg` up and a short one on a phone.
   */
  getAnnouncementBar(): Locator {
    return this.getByTestId("store-announcement-bar").filter({
      visible: true,
    });
  }

  /** The bar's link, when the announcement has one (FER-020). */
  getAnnouncementLink(): Locator {
    return this.getAnnouncementBar().getByTestId("store-announcement-bar-link");
  }

  /** The bar's whole notice, in the HTML at every width. */
  getAnnouncementFull(): Locator {
    return this.getAnnouncementBar().getByTestId("store-announcement-bar-full");
  }

  /** The bar's phone version, for the eye only. */
  getAnnouncementShort(): Locator {
    return this.getAnnouncementBar().getByTestId(
      "store-announcement-bar-short"
    );
  }

  /**
   * How many lines the bar's words take on screen: the line boxes of the
   * version shown (the whole notice from `lg` up, the short one below).
   */
  async announcementLines(): Promise<number> {
    // Each version's lines, none when it is not drawn: hidden, or
    // `sr-only`, one pixel wide.
    const linesOf = async (version: Locator) =>
      await version.evaluateAll((elements) =>
        elements.flatMap((element) =>
          element instanceof HTMLElement &&
          element.getClientRects().length > 0 &&
          element.offsetWidth > 1
            ? [
                new Set(
                  [...element.getClientRects()].map((rect) =>
                    Math.round(rect.top)
                  )
                ).size,
              ]
            : []
        )
      );
    const shown = [
      ...(await linesOf(this.getAnnouncementFull())),
      ...(await linesOf(this.getAnnouncementShort())),
    ];

    return shown[0] ?? 0;
  }

  /**
   * The language pill, the header's from a tablet up or the phone menu's
   * once it is open; after a switch the page left behind stays mounted,
   * hidden, with a pill of its own.
   */
  getLocaleToggle(): Locator {
    return this.getByTestId("locale-toggle").filter({ visible: true });
  }

  /** The pill's thumb: `data-side` says which language it sits under. */
  getLocaleToggleThumb(): Locator {
    return this.getLocaleToggle().getByTestId("locale-toggle-thumb");
  }

  /** The header's search icon, which opens the search panel. */
  getSearchButton(): Locator {
    return this.getByTestId("store-search-button").filter({ visible: true });
  }

  /**
   * The search icon once React owns it, ready to open the dialog. Before
   * then it opens the browser's own plain panel, which covers the header
   * until it is closed; the icon drops its `popovertarget` when React takes
   * over, so that is what this waits for.
   */
  async getLiveSearchButton(): Promise<Locator> {
    const button = this.getSearchButton();
    await this.expectVisible(button, 60_000);
    await expect(button).not.toHaveAttribute("popovertarget", {
      timeout: 60_000,
    });

    return button;
  }

  /** The dark panel under the header, with the one search field. */
  getSearchPanel(): Locator {
    return this.getByTestId("store-search-panel").filter({ visible: true });
  }

  /** The phone menu's button, by its name in the page's language. */
  getMenuButton(name: string): Locator {
    return this.page.getByRole("button", { name });
  }

  getMobileMenu(): Locator {
    return this.getByTestId("store-mobile-menu").filter({ visible: true });
  }

  getDescription(): Locator {
    return this.getByTestId("store-description").filter({ visible: true });
  }

  /**
   * The store's not-found page (`(store)/not-found.tsx`), under the store's
   * header: every address no page answers, an old one included.
   */
  getNotFoundHeading(): Locator {
    return this.page.getByRole("heading", {
      level: 1,
      name: "No encontramos esta página",
    });
  }
}

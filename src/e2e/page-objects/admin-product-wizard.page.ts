import { expect, type Locator } from "@playwright/test";

import { completeRpcAction } from "../fixtures/complete-rpc-action";
import { AdminPage } from "./admin.page";

/** The wizard's steps, as their containers name them. */
type WizardStep = "details" | "photos" | "review";

/**
 * The article wizard (FER-017), in Spanish. After a navigation the page left
 * behind stays mounted and hidden, so every locator takes the visible one.
 */
export class AdminProductWizardPage extends AdminPage {
  async gotoNew(prefix = ""): Promise<void> {
    await this.goto(`${prefix}/admin/products/new`);
    await this.waitForWizard();
  }

  async gotoArticle(
    id: number,
    { prefix = "", step }: { prefix?: string; step?: WizardStep } = {}
  ): Promise<void> {
    await this.goto(
      `${prefix}/admin/products/${id}${step ? `?step=${step}` : ""}`
    );
    await this.waitForWizard();
  }

  /** The wizard once React owns it: its step shows only after hydration. */
  async waitForWizard(): Promise<void> {
    await expect(
      this.page.locator("[data-testid^='product-step-']").filter({
        visible: true,
      })
    ).toBeVisible();
  }

  step(name: WizardStep): Locator {
    return this.getByTestId(`product-step-${name}`).filter({ visible: true });
  }

  photoInput(): Locator {
    return this.getByTestId("product-photo-input").filter({ visible: true });
  }

  /** The article's photos, in their order (not the ones on their way). */
  photos(): Locator {
    return this.getByTestId("product-photo").filter({ visible: true });
  }

  /** The address each photo holds, in their order. */
  async photoUrls(): Promise<string[]> {
    return await this.photos().evaluateAll((tiles) =>
      tiles.map((tile) =>
        tile instanceof HTMLElement ? (tile.dataset.url ?? "") : ""
      )
    );
  }

  next(): Locator {
    return this.getByTestId("product-next").filter({ visible: true });
  }

  publishButton(): Locator {
    return this.getByTestId("product-publish").filter({ visible: true });
  }

  saveChangesButton(): Locator {
    return this.getByTestId("product-save-changes").filter({ visible: true });
  }

  saveStatus(): Locator {
    return this.getByTestId("product-save-status")
      .filter({ visible: true })
      .getByRole("status");
  }

  titleField(): Locator {
    return this.page
      .getByRole("textbox", { exact: true, name: "Título" })
      .filter({ visible: true });
  }

  priceField(): Locator {
    return this.page
      .getByRole("textbox", { exact: true, name: /^(Precio|Price)$/u })
      .filter({ visible: true });
  }

  categoryField(): Locator {
    return this.page
      .getByRole("combobox", { name: /^(Categoría|Category)$/u })
      .filter({ visible: true });
  }

  /** Where the wizard says what happened to a photo, politely. */
  liveRegion(): Locator {
    return this.getByTestId("product-wizard-announcement");
  }

  /** Uploads `files` and waits until the article holds `total` photos. */
  async addPhotos(files: string[], total: number): Promise<void> {
    await this.photoInput().setInputFiles(files);
    await expect(this.photos()).toHaveCount(total);
  }

  /**
   * The first photo of a new article: it creates the draft, whose id the
   * address then carries.
   */
  async addFirstPhotos(files: string[]): Promise<number> {
    await completeRpcAction(this.page, "/api/orpc/product/create", async () => {
      await this.photoInput().setInputFiles(files);
    });
    await expect(this.page).toHaveURL(/\/admin\/products\/\d+/u);
    const id = Number(/\/admin\/products\/(\d+)/u.exec(this.page.url())?.[1]);
    await expect(this.photos()).toHaveCount(files.length);

    return id;
  }

  /**
   * Arms a wait for the autosave whose request `matches` (the text of its
   * body): the save after a pause in the typing, which "Guardado" from an
   * earlier save does not prove. Arm it before the last change.
   */
  savedWhen(matches: (body: string) => boolean): Promise<unknown> {
    return this.page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/orpc/product/update" &&
        response.ok() &&
        matches(response.request().postData() ?? "")
    );
  }

  /** Waits for the draft's autosave to land. */
  async expectSaved(): Promise<void> {
    await expect(this.saveStatus()).toHaveText(/^(Guardado|Saved)$/u);
  }
}

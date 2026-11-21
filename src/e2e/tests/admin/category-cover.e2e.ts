import type { Page } from "@playwright/test";

import { type DbFixture, expect, test, uniqueTag } from "../../fixtures";
import { interceptBlobStore, seedPhoto } from "../../fixtures/blob-store";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";

// FER-011. A cover is uploaded from the categories screen and shows on the
// category's page. Nothing reaches the real Blob store: the browser's upload
// to Vercel's API is answered here, and so is `next/image`'s request for the
// file, which lives nowhere. The token and the save are the app's own.
test.use({ storageState: { cookies: [], origins: [] } });

const PHOTO = seedPhoto("ring-2.jpg");

/** A category of its own with one article, signed in, on the screen. */
async function setup({ db, page }: { db: DbFixture["db"]; page: Page }) {
  const tag = uniqueTag();
  const name = `Anillos ${tag}`;
  const created = await db.seed.createCategory({
    nameEs: name,
    slug: `anillos-${tag}`,
  });
  await db.seed.createArticle({
    categoryId: created.id,
    title: `Anillo sello ${tag}`,
  });
  const { uploads } = await interceptBlobStore(page);
  const login = await db.seed.createLogin();
  const signIn = new AdminSignInPage(page);
  await signIn.goto();
  await signIn.signIn(login.email, login.password);
  const admin = new AdminPage(page);
  await admin.waitForLoad();
  await admin.goto("/admin/categories");
  await expect(admin.heading()).toHaveText("Categorías");

  return { name, slug: created.slug, tag, uploads };
}

test.describe("Category cover upload", () => {
  test("uploads a computer photo, saves it with the page, and the category's page shows it at both widths", async ({
    db,
    page,
  }) => {
    test.slow();
    const { name, slug, tag, uploads } = await setup({ db, page });
    const row = page.getByTestId(`category-row-anillos-${tag}`);
    const form = page.getByTestId("category-page-form");

    // The first open after the page loaded: repeated until React owns it.
    await clickUntilVisible(
      row.getByRole("button", { name: `Página y grupo: ${name}` }),
      form
    );
    const computer = form.getByRole("group", { name: "Foto para computadora" });
    const phone = form.getByRole("group", {
      name: "Foto para celular (opcional)",
    });
    await expect(
      phone.getByRole("button", {
        name: "Elegir foto: Foto para celular (opcional)",
      })
    ).toBeDisabled();

    await computer.getByTestId("image-uploader-input").setInputFiles(PHOTO);

    await expect(computer.getByRole("status")).toHaveText("Foto subida.");
    await expect(
      computer.getByRole("img", { name: "Vista previa: Foto para computadora" })
    ).toBeVisible();
    expect(uploads).toHaveLength(1);
    const [uploaded] = uploads;
    expect(uploaded).toMatch(
      /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/local\/cover\/[0-9a-f-]{36}\.(?:webp|jpg)$/
    );
    await expect(
      phone.getByRole("button", {
        name: "Elegir foto: Foto para celular (opcional)",
      })
    ).toBeEnabled();

    await completeRpcAction(page, "/api/orpc/category/updatePage", async () => {
      await form.getByRole("button", { name: "Guardar la página" }).click();
    });
    await expect(form).toHaveCount(0);

    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ height, width });
      await page.goto(`/${slug}`);

      const cover = page.getByTestId("store-catalog-cover");
      const image = cover.getByRole("img", { name });
      await expect(image).toBeVisible();
      await expect(
        cover.getByRole("heading", { level: 1, name })
      ).toBeVisible();
      // The uploaded file is the one the page asks for.
      expect(
        decodeURIComponent((await image.getAttribute("src")) ?? "")
      ).toContain(uploaded);
      await expect
        .poll(
          async () =>
            await image.evaluate(
              (element: HTMLImageElement) =>
                element.complete && element.naturalWidth > 0
            )
        )
        .toBe(true);
    }
  });

  test("Save waits while the photo is on its way, and Cancel does not", async ({
    db,
    page,
  }) => {
    const { name, tag } = await setup({ db, page });
    let arrive = (): void => undefined;
    const arrived = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    // The store holds the upload until the test lets it through.
    await page.route("https://vercel.com/api/blob/**", async (route) => {
      await arrived;
      await route.fallback();
    });
    const row = page.getByTestId(`category-row-anillos-${tag}`);
    const form = page.getByTestId("category-page-form");
    await clickUntilVisible(
      row.getByRole("button", { name: `Página y grupo: ${name}` }),
      form
    );
    const computer = form.getByRole("group", { name: "Foto para computadora" });
    const save = form.getByRole("button", { name: "Guardar la página" });

    await computer.getByTestId("image-uploader-input").setInputFiles(PHOTO);

    await expect(computer).toHaveAttribute("aria-busy", "true");
    await expect(save).toBeDisabled();
    await expect(
      form.getByRole("button", { exact: true, name: "Cancelar" })
    ).toBeEnabled();

    arrive();

    await expect(computer.getByRole("status")).toHaveText("Foto subida.");
    await expect(save).toBeEnabled();
  });

  test("a failed upload says so and is retried with the same photo", async ({
    db,
    page,
  }) => {
    const { name, tag, uploads } = await setup({ db, page });
    let refused = false;
    // The store refuses the first upload; the rest pass. A refusal, not a
    // dropped connection, which the SDK would retry on its own.
    await page.route("https://vercel.com/api/blob/**", async (route) => {
      if (!refused) {
        refused = true;
        await route.fulfill({
          json: { error: { code: "forbidden", message: "Access denied" } },
          status: 403,
        });
        return;
      }

      await route.fallback();
    });
    const row = page.getByTestId(`category-row-anillos-${tag}`);
    const form = page.getByTestId("category-page-form");
    await clickUntilVisible(
      row.getByRole("button", { name: `Página y grupo: ${name}` }),
      form
    );
    const computer = form.getByRole("group", { name: "Foto para computadora" });

    await computer.getByTestId("image-uploader-input").setInputFiles(PHOTO);

    await expect(computer.getByRole("alert")).toHaveText(
      "No se pudo subir la foto. Revisá la conexión y reintentá."
    );
    await computer
      .getByRole("button", { name: "Reintentar: Foto para computadora" })
      .click();
    await expect(computer.getByRole("status")).toHaveText("Foto subida.");
    expect(uploads).toHaveLength(1);
  });
});

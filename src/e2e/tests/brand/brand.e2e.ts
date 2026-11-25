import { expect, test } from "../../fixtures";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";
import { StorePage } from "../../page-objects/store.page";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** A PNG's pixel size, read from its header (the IHDR chunk). */
function readPngSize(body: Buffer) {
  expect(body.subarray(0, 4)).toEqual(PNG_SIGNATURE);

  return { height: body.readUInt32BE(20), width: body.readUInt32BE(16) };
}

test.describe("Brand identity, signed in", () => {
  test("the admin's sidebar shows the full LR Market logo at its smallest size", async ({
    authenticatedPage: page,
  }) => {
    await new AdminPage(page).goto();

    const logo = page
      .getByRole("banner")
      .getByRole("img", { name: "LR Market" });
    await expect(logo).toBeVisible();
    // The tag with LR and MARKET (FER-040), never under 96 px tall, keeping
    // the drawing's 116:84 proportions (docs/brand/brand.md).
    await expect(logo).toHaveAttribute("data-variant", "full");
    const box = await logo.boundingBox();
    expect(box?.height).toBe(96);
    expect(Math.round(box?.width ?? 0)).toBe(133);
  });
});

test.describe("Brand identity", () => {
  // The identity is the same for everyone: no session decides it.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a page links the favicon, the tab icon and the home-screen icon at addresses no deploy changes, each a square of its size", async ({
    page,
  }) => {
    const signIn = new AdminSignInPage(page);

    await signIn.goto();

    const head = await signIn.readHeadTags();
    const linked = (rel: string) =>
      head.filter((tag) => tag.key === rel).map((tag) => tag.href);

    // No hash in a query: a search engine keeps the icon it found at a URL.
    expect(linked("icon")).toEqual(["/favicon.ico", "/icon.png"]);
    expect(linked("apple-touch-icon")).toEqual(["/apple-icon.png"]);

    for (const [path, size] of [
      ["/icon.png", 96],
      ["/apple-icon.png", 180],
    ] as const) {
      const response = await page.request.get(path, { maxRedirects: 0 });

      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
      expect(readPngSize(await response.body())).toEqual({
        height: size,
        width: size,
      });
    }
  });

  test("/favicon.ico answers the brand's 48 px mark as an icon file, not a page", async ({
    request,
  }) => {
    const response = await request.get("/favicon.ico", { maxRedirects: 0 });
    const body = await response.body();

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/x-icon");
    // An ICO header holding one image, the PNG after its 22 bytes.
    expect([body.readUInt16LE(2), body.readUInt16LE(4)]).toEqual([1, 1]);
    expect(readPngSize(body.subarray(22))).toEqual({ height: 48, width: 48 });
  });

  for (const [path, prefix] of [
    ["/", "/es"],
    ["/en/contacto", "/en"],
  ] as const) {
    test(`a link to ${path}, a store page with no picture of its own, shares the brand's 1200 by 630 card`, async ({
      page,
    }) => {
      const storePage = new StorePage(page);

      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

      await expect
        .poll(async () => await storePage.readMeta("og:image"))
        .not.toBeNull();
      const image = new URL((await storePage.readMeta("og:image")) ?? "");
      expect(image.pathname).toBe(`${prefix}/opengraph-image`);
      expect(await storePage.readMeta("og:image:alt")).toBe("LR Market");

      const card = await page.request.get(image.pathname, { maxRedirects: 0 });

      expect(card.status()).toBe(200);
      expect(card.headers()["content-type"]).toBe("image/png");
      expect(readPngSize(await card.body())).toEqual({
        height: 630,
        width: 1200,
      });
    });
  }

  for (const [path, prefix, heading, description] of [
    [
      "/admin/sign-in",
      "/es",
      "Panel de tu tienda",
      "Bijou y pistolas de burbujas, en la feria y en línea.",
    ],
    [
      "/en/admin/sign-in",
      "/en",
      "Your store's admin",
      "Jewelry and bubble guns, at the fair and online.",
    ],
  ] as const) {
    test(`a link to ${path} shares as LR Market with its 1200 by 630 card, served without a redirect`, async ({
      page,
    }) => {
      const signIn = new AdminSignInPage(page);

      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();

      const head = await signIn.readHeadTags();
      // The prerendered shell and the streamed page can each declare a tag,
      // against the origin they were rendered for: the first one is read.
      const meta = (key: string) =>
        head.find((tag) => tag.key === key)?.content;

      expect(meta("og:title")).toBe("LR Market");
      expect(meta("og:site_name")).toBe("LR Market");
      expect(meta("og:description")).toBe(description);
      expect(meta("og:image:alt")).toBe("LR Market");
      expect(meta("twitter:card")).toBe("summary_large_image");

      const image = new URL(meta("og:image") ?? "");
      expect(image.pathname).toBe(`${prefix}/opengraph-image`);

      const response = await page.request.get(
        `${image.pathname}${image.search}`,
        { maxRedirects: 0 }
      );

      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
      expect(readPngSize(await response.body())).toEqual({
        height: 630,
        width: 1200,
      });
    });
  }

  test("the logo files are served as SVG, outside any language", async ({
    request,
  }) => {
    for (const file of ["lr-market-logo.svg", "lr-market-mark.svg"]) {
      const response = await request.get(`/brand/${file}`, {
        maxRedirects: 0,
      });

      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/svg+xml");
      expect(await response.text()).toContain('aria-label="LR Market"');
    }
  });
});

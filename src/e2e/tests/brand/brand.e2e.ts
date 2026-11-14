import { expect, test } from "../../fixtures";
import { HomePage } from "../../page-objects/home.page";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** A PNG's pixel size, read from its header (the IHDR chunk). */
function readPngSize(body: Buffer) {
  expect(body.subarray(0, 4)).toEqual(PNG_SIGNATURE);

  return { height: body.readUInt32BE(20), width: body.readUInt32BE(16) };
}

test.describe("Brand identity", () => {
  // The identity is the same for everyone: no session decides it.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the header shows the LR Market mark", async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    const logo = page
      .getByRole("banner")
      .getByRole("img", { name: "LR Market" });
    await expect(logo).toBeVisible();
    // The mark keeps the drawing's 116:84 proportions at its 48 px height.
    const box = await logo.boundingBox();
    expect(box?.height).toBe(48);
    expect(Math.round(box?.width ?? 0)).toBe(66);
  });

  test("the page is titled LR Market and links a generated tab icon and home-screen icon", async ({
    page,
  }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    await expect(page).toHaveTitle("LR Market");

    for (const [selector, size] of [
      ['link[rel="icon"]', 32],
      ['link[rel="apple-touch-icon"]', 180],
    ] as const) {
      const href = await page.locator(selector).getAttribute("href");
      expect(href).not.toBeNull();

      const response = await page.request.get(href ?? "");

      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
      expect(readPngSize(await response.body())).toEqual({
        height: size,
        width: size,
      });
    }
  });

  for (const [path, prefix, description] of [
    ["/", "/es", "Bijou y pistolas de burbujas, en la feria y en línea."],
    ["/en", "/en", "Jewelry and bubble guns, at the fair and online."],
  ] as const) {
    test(`a link to ${path} shares as LR Market with its 1200 by 630 card, served without a redirect`, async ({
      page,
    }) => {
      await page.goto(path);

      const meta = (property: string) =>
        page.locator(`meta[property="og:${property}"]`);
      await expect(meta("title")).toHaveAttribute("content", "LR Market");
      await expect(meta("site_name")).toHaveAttribute("content", "LR Market");
      await expect(meta("description")).toHaveAttribute("content", description);
      await expect(meta("image:alt")).toHaveAttribute("content", "LR Market");
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        "content",
        "summary_large_image"
      );

      // The prerendered shell and the streamed page each declare the image,
      // against the origin they were rendered for: the same path either way.
      const image = new URL(
        (await meta("image").first().getAttribute("content")) ?? ""
      );
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

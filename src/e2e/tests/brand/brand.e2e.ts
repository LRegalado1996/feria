import { expect, test } from "../../fixtures";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** A PNG's pixel size, read from its header (the IHDR chunk). */
function readPngSize(body: Buffer) {
  expect(body.subarray(0, 4)).toEqual(PNG_SIGNATURE);

  return { height: body.readUInt32BE(20), width: body.readUInt32BE(16) };
}

test.describe("Brand identity, signed in", () => {
  test("the admin's header shows the LR Market mark", async ({
    authenticatedPage: page,
  }) => {
    await new AdminPage(page).goto();

    const logo = page
      .getByRole("banner")
      .getByRole("img", { name: "LR Market" });
    await expect(logo).toBeVisible();
    // The mark keeps the drawing's 116:84 proportions at its 32 px height.
    const box = await logo.boundingBox();
    expect(box?.height).toBe(32);
    expect(Math.round(box?.width ?? 0)).toBe(44);
  });
});

test.describe("Brand identity", () => {
  // The identity is the same for everyone: no session decides it.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a page links a generated tab icon and home-screen icon", async ({
    page,
  }) => {
    const signIn = new AdminSignInPage(page);

    await signIn.goto();

    const head = await signIn.readHeadTags();

    for (const [rel, path, size] of [
      ["icon", "/icon", 32],
      ["apple-touch-icon", "/apple-icon", 180],
    ] as const) {
      const href = head.find((tag) => tag.key === rel)?.href ?? "";
      expect(href.split("?")[0]).toBe(path);

      const response = await page.request.get(href);

      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
      expect(readPngSize(await response.body())).toEqual({
        height: size,
        width: size,
      });
    }
  });

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

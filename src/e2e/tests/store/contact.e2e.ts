import type { Locator } from "@playwright/test";

import {
  expect,
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  STORE_SETTINGS,
  STORE_TEXTS,
  test,
} from "../../fixtures";
import { StorePage } from "../../page-objects/store.page";

// FER-080. The contact page, with the run's settings (`STORE_SETTINGS`:
// a WhatsApp number, Instagram, no TikTok, and where the store is, written
// in Spanish only). A store with no contact data is
// `store-settings.serial.e2e.ts`'s, which may change the settings.
test.use({ storageState: { cookies: [], origins: [] } });

const BINGBOT =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

/** A tile's edges, in whole pixels. */
async function edgesOf(tile: Locator) {
  const box = await tile.boundingBox();

  if (!box) {
    throw new Error("The tile has no box: it is not drawn");
  }

  return {
    bottom: Math.round(box.y + box.height),
    left: Math.round(box.x),
    right: Math.round(box.x + box.width),
    top: Math.round(box.y),
    width: Math.round(box.width),
  };
}

const WA_HREF = `https://wa.me/${STORE_SETTINGS.whatsappNumber.slice(1)}`;

test.describe("The contact page", () => {
  test("in Spanish at /contacto: WhatsApp as the main action with the number as it is written here, the profiles the store has, where it is, and how to buy", async ({
    page,
  }) => {
    const storePage = new StorePage(page);
    const response = await page.goto("/contacto");

    expect(response?.status()).toBe(200);
    await storePage.expectDocumentLanguage("es");
    const contact = page.getByTestId("store-contact");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Contacto"
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(
      contact.getByText(STORE_SETTINGS.name, { exact: true })
    ).toBeVisible();

    const reach = contact.getByRole("region", {
      name: "Escribinos por WhatsApp",
    });
    const whatsapp = reach.getByRole("link", { name: /WhatsApp/u });
    await expect(whatsapp).toHaveAccessibleName(
      "WhatsApp 099 123 456 (se abre en otra pestaña)"
    );
    await expect(whatsapp).toHaveAttribute("href", WA_HREF);
    await expect(whatsapp).toHaveAttribute("target", "_blank");
    await expect(
      reach.getByRole("link", { name: `Instagram de ${STORE_SETTINGS.name}` })
    ).toHaveAttribute("href", STORE_SETTINGS.instagramUrl);
    // The run's store has no TikTok: the page offers none.
    await expect(contact.getByRole("link", { name: /TikTok/u })).toHaveCount(0);

    await expect(
      contact.getByRole("region", { name: "Dónde encontrarnos" })
    ).toContainText(STORE_TEXTS.es.location);

    const how = contact.getByRole("region", { name: "Comprá en 3 pasos" });
    await expect(
      how.getByRole("list").first().getByRole("listitem")
    ).toHaveText([
      "01ElegíMirá el catálogo en la web.",
      "02Agregá al carritoDejá tu nombre y tu celular.",
      "03Te lo entregamosEn el puesto o te lo mandamos.",
    ]);
    await expect(
      how.getByRole("list", { name: "Pagás con" }).getByRole("listitem")
    ).toHaveText([
      "Efectivo",
      "Tarjetas de crédito y débito",
      "Mercado Pago",
      "Transferencia bancaria",
    ]);
    await expect(
      how.getByRole("link", { name: "Ver el catálogo" })
    ).toHaveAttribute("href", "/productos");

    // Its own title and description, its canonical address and its twin.
    await expect(page).toHaveTitle(`Contacto · ${STORE_SETTINGS.name}`);
    await expect
      .poll(async () => await storePage.readMeta("description"))
      .toBe(
        `Cómo contactar a ${STORE_SETTINGS.name}: WhatsApp, redes y dónde encontrarnos.`
      );
    await expect
      .poll(async () => await storePage.readLinkHref("canonical"))
      .toMatch(/^https?:\/\/[^/]+\/contacto$/u);
    await expect
      .poll(async () => await storePage.readLinkHref("alternate", "en"))
      .toMatch(/^https?:\/\/[^/]+\/en\/contacto$/u);
  });

  test("in English at /en/contacto: the page's words in English, the store's own line as it was written, and the catalog in English", async ({
    page,
  }) => {
    const storePage = new StorePage(page);
    await page.goto("/en/contacto");

    await storePage.expectDocumentLanguage("en");
    const contact = page.getByTestId("store-contact");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contact");
    await expect(
      contact
        .getByRole("region", { name: "Write to us on WhatsApp" })
        .getByRole("link", { name: /WhatsApp/u })
    ).toHaveAccessibleName("WhatsApp 099 123 456 (opens in a new tab)");
    const place = contact
      .getByRole("region", { name: "Where to find us" })
      .getByText(STORE_TEXTS.es.location);
    await expect(place).toHaveAttribute("lang", "es");
    await expect(
      contact
        .getByRole("region", { name: "Buy in 3 steps" })
        .getByRole("link", { name: "See the catalog" })
    ).toHaveAttribute("href", "/en/productos");
    await expect(page).toHaveTitle(`Contact · ${STORE_SETTINGS.name}`);
    await expect
      .poll(async () => await storePage.readLinkHref("canonical"))
      .toMatch(/^https?:\/\/[^/]+\/en\/contacto$/u);
  });

  test("on a computer the moss tile sits beside the grey ones; on a 360 px phone they are one column and nothing scrolls sideways", async ({
    page,
  }) => {
    const storePage = new StorePage(page);
    const contact = page.getByTestId("store-contact");
    const reach = contact.getByTestId("store-contact-reach");
    const place = contact.getByTestId("store-contact-location");
    const how = contact.getByTestId("store-contact-how");

    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto("/contacto");
    await expect(contact).toBeVisible();
    const wide = {
      how: await edgesOf(how),
      place: await edgesOf(place),
      reach: await edgesOf(reach),
    };
    // Two columns: the moss tile on the left, as tall as both grey ones.
    expect(wide.reach.left).toBeLessThan(wide.place.left);
    expect(wide.place.left).toBe(wide.how.left);
    expect(wide.reach.top).toBe(wide.place.top);
    expect(wide.reach.bottom).toBe(wide.how.bottom);
    expect(wide.how.top).toBeGreaterThan(wide.place.bottom);

    await page.setViewportSize({ height: 780, width: 360 });
    await page.goto("/contacto");
    await expect(contact).toBeVisible();
    const narrow = {
      how: await edgesOf(how),
      place: await edgesOf(place),
      reach: await edgesOf(reach),
    };
    // One column, each tile the page's width less its 16 px margins, the
    // moss tile first, then where the store is, then how to buy.
    expect(
      [narrow.reach, narrow.place, narrow.how].map((box) => [
        box.left,
        box.width,
      ])
    ).toEqual([
      [16, 360 - 32],
      [16, 360 - 32],
      [16, 360 - 32],
    ]);
    expect(narrow.place.top).toBeGreaterThan(narrow.reach.bottom);
    expect(narrow.how.top).toBeGreaterThan(narrow.place.bottom);
    // The main action is a thumb's target and stays inside its tile.
    const pill = await edgesOf(
      contact.getByRole("link", { name: /WhatsApp/u })
    );
    expect(pill.bottom - pill.top).toBeGreaterThanOrEqual(44);
    expect(pill.right).toBeLessThanOrEqual(360 - 16);
    await storePage.expectNoHorizontalScroll();
  });

  test("a crawler that runs no script finds the contact details in the HTML, and the page's structured data", async ({
    baseURL,
    browser,
  }) => {
    // A hand-made context gets none of the config's `use` options.
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      javaScriptEnabled: false,
      userAgent: BINGBOT,
    });

    try {
      const page = await context.newPage();
      const response = await page.goto("/contacto");

      expect(response?.status()).toBe(200);
      const contact = page.getByTestId("store-contact");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Contacto"
      );
      await expect(
        contact.getByRole("link", { name: /WhatsApp/u })
      ).toHaveAttribute("href", WA_HREF);
      await expect(contact).toContainText(STORE_TEXTS.es.location);
      await expect(contact).toContainText("Mercado Pago");
      const storePage = new StorePage(page);
      await expect(storePage.getFooter()).toBeVisible();
      const [parsed] = await storePage.readStructuredData();
      const organization: unknown = Array.isArray(parsed) ? parsed[0] : null;
      expect(organization).toMatchObject({
        "@type": "Organization",
        contactPoint: {
          "@type": "ContactPoint",
          telephone: STORE_SETTINGS.whatsappNumber,
        },
        name: STORE_SETTINGS.name,
        sameAs: [STORE_SETTINGS.instagramUrl],
      });
    } finally {
      await context.close();
    }
  });

  test("the footer leads to it in both languages, and the sitemap lists it", async ({
    page,
  }) => {
    const storePage = new StorePage(page);
    await storePage.goto();
    const link = storePage
      .getFooter()
      .getByRole("region", { name: "Ayuda" })
      .getByRole("link", { name: "Página de contacto" });
    await expect(link).toHaveAttribute("href", "/contacto");

    await link.click();
    await expect(page).toHaveURL(/\/contacto$/u);
    await expect(page.getByTestId("store-contact")).toBeVisible();

    await storePage.gotoEnglish();
    await expect(
      storePage
        .getFooter()
        .getByRole("region", { name: "Help" })
        .getByRole("link", { name: "Contact page" })
    ).toHaveAttribute("href", "/en/contacto");

    const sitemap = await (await page.request.get("/sitemap.xml")).text();
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(
      (match) => new URL(match[1] ?? "").pathname
    );
    expect(paths.filter((path) => path.endsWith("/contacto"))).toEqual([
      "/contacto",
      "/en/contacto",
    ]);
  });
});

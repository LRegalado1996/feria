import type { Locator } from "@playwright/test";
import { eq } from "drizzle-orm";

import type { PageSection } from "../../../lib/schemas/page";
import { product } from "../../../server/db/schema";
import {
  expect,
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  STORE_SETTINGS,
  STORE_TEXTS,
  test,
  uniqueTag,
} from "../../fixtures";
import { interceptBlobStore, seedPhoto } from "../../fixtures/blob-store";
import type { DbFixture } from "../../fixtures/db.fixture";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import type { HomeEdit } from "../../fixtures/store.fixture";
import { AdminHomePage } from "../../page-objects/admin-home.page";
import { StorePage } from "../../page-objects/store.page";

// FER-022. The storefront's home shows the store's one curation, which every
// spec reads, so this spec is serial: each test sets what it shows through
// `homeEdit` (whose end saves the order back, deletes the banners added and
// shows again what `hideEverything` hid) and its own rows (the `db`
// fixture's). On a database seeded for development the home holds more
// than the test's: each test places its own sections first and asserts on
// them, never on the whole page.

const BINGBOT =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

const PHOTOS = {
  bubbles: { height: 1063, url: "/seed/bubbles-1.jpg", width: 1600 },
  bubblesPhone: { height: 1063, url: "/seed/bubbles-1-phone.jpg", width: 850 },
  necklace: { height: 1067, url: "/seed/necklace-4.jpg", width: 1600 },
  ring: { height: 800, url: "/seed/ring-3.jpg", width: 1200 },
  ringPhone: { height: 800, url: "/seed/ring-3-phone.jpg", width: 800 },
};

/** Whether two places of the home's sequence are the same place. */
function samePlace(a: PageSection, b: PageSection): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The test's own home, placed first: a cover of two banners (the first
 * with a phone crop), then a category's row, a banner between rows, the
 * best sellers (two of the row's articles, the second first) and another
 * category's row; whatever the store had follows.
 */
async function curateHome(db: DbFixture["db"], homeEdit: HomeEdit) {
  const tag = uniqueTag();
  const titles = {
    between: `Entre filas ${tag}`,
    betweenEn: `Between rows ${tag}`,
    cover: `Portada ${tag}`,
    coverEn: `Cover ${tag}`,
    coverTwo: `Portada dos ${tag}`,
    other: `Otra ${tag}`,
    row: `Fila ${tag}`,
    rowEn: `Row ${tag}`,
  };
  const shelf = await db.seed.createCategory({
    nameEn: titles.rowEn,
    nameEs: titles.row,
    slug: `fila-${tag}`,
  });
  const other = await db.seed.createCategory({
    nameEs: titles.other,
    slug: `otra-${tag}`,
  });
  const articles = [`Anillo ${tag}`, `Cadena ${tag}`, `Aros ${tag}`];
  const first = await db.seed.createArticle({
    categoryId: shelf.id,
    priceAmount: 129_000,
    title: `Anillo ${tag}`,
  });
  const second = await db.seed.createArticle({
    categoryId: shelf.id,
    priceAmount: 89_000,
    title: `Cadena ${tag}`,
  });
  await db.seed.createArticle({
    categoryId: shelf.id,
    priceAmount: 49_000,
    title: `Aros ${tag}`,
  });
  await db.seed.createArticle({
    categoryId: other.id,
    priceAmount: 99_000,
    title: `Pulsera ${tag}`,
  });
  const cover = await db.seed.createBanner({
    image: PHOTOS.ring,
    link: { categoryId: shelf.id },
    phoneImage: PHOTOS.ringPhone,
    placement: "cover",
    titleEn: titles.coverEn,
    titleEs: titles.cover,
  });
  const coverTwo = await db.seed.createBanner({
    image: PHOTOS.necklace,
    link: { url: "/productos" },
    placement: "cover",
    titleEs: titles.coverTwo,
  });
  const between = await db.seed.createBanner({
    ctaEs: "Ver todo el catálogo",
    image: PHOTOS.bubbles,
    link: { url: "/productos" },
    phoneImage: PHOTOS.bubblesPhone,
    placement: "rows",
    titleEn: titles.betweenEn,
    titleEs: titles.between,
  });
  const before = await homeEdit.read();
  const mine: PageSection[] = [
    { categoryId: shelf.id, kind: "category" },
    { bannerId: between.id, kind: "banner" },
    { kind: "best_sellers" },
    { categoryId: other.id, kind: "category" },
  ];
  await homeEdit.saveLayout({
    coverBannerIds: [
      cover.id,
      coverTwo.id,
      ...before.coverBannerIds.filter(
        (id) => id !== cover.id && id !== coverTwo.id
      ),
    ],
    featuredProductIds: before.featuredProductIds,
    rankingProductIds: [second.id, first.id],
    sections: [
      ...mine,
      ...before.sections.filter(
        (section) => !mine.some((place) => samePlace(place, section))
      ),
    ],
  });

  return { articles, shelf, tag, titles };
}

/** The `h2` of each of the home's first `count` sections, in order. */
async function firstHeadings(store: StorePage, count: number) {
  const headings = await store
    .getHomeSections()
    .getByRole("heading", { level: 2 })
    .allTextContents();

  return headings.slice(0, count);
}

/** The photo the browser chose, once it chose one. */
async function chosenPhoto(photo: Locator) {
  return await photo.evaluate((image) =>
    image instanceof HTMLImageElement
      ? decodeURIComponent(image.currentSrc)
      : ""
  );
}

test.describe("The storefront's home", () => {
  test("in Spanish, opens on the cover and shows the rows and the banner between them in the order set, each leading on", async ({
    db,
    homeEdit,
    page,
  }) => {
    const { articles, shelf, titles } = await curateHome(db, homeEdit);
    await page.setViewportSize({ height: 900, width: 1440 });
    const store = new StorePage(page);
    await store.goto();

    // The store's name is the page's one h1, for the ear; the cover opens
    // the page under the header.
    await expect(store.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(store.getHomeView()).toHaveAttribute("data-kind", "sections");
    const cover = store.getHomeCover();
    const first = cover.getByRole("link", {
      name: `${titles.cover} Comprar ahora`,
    });
    await expect(first).toHaveAttribute("href", `/${shelf.slug}`);
    // The cover's first photo is the page's priority image, the computer's
    // here; the others wait.
    const photo = first.getByTestId("store-banner-photo");
    await expect(photo).toHaveAttribute("fetchpriority", "high");
    await expect(photo).toHaveAttribute("loading", "eager");
    await expect
      .poll(async () => await chosenPhoto(photo))
      .toContain("/seed/ring-3.jpg");
    await expect(
      cover
        .getByRole("link", { name: `${titles.coverTwo} Comprar ahora` })
        .getByTestId("store-banner-photo")
    ).toHaveAttribute("loading", "lazy");

    expect(await firstHeadings(store, 4)).toEqual([
      titles.row,
      titles.between,
      "Más vendidos",
      titles.other,
    ]);

    // A category's row: its cards lead to the articles, "Ver todo" to its
    // page.
    const row = store.getHomeSection(titles.row);
    await expect(row.getByRole("heading", { level: 3 })).toHaveText(articles);
    await expect(
      row.getByRole("link", { name: `Ver todo: ${titles.row}` })
    ).toHaveAttribute("href", `/${shelf.slug}`);
    await expect(row.getByText("$ 1.290")).toBeVisible();
    // The best sellers, in the order ranked, with no "Ver todo".
    const bestSellers = store.getHomeSection("Más vendidos");
    await expect(bestSellers.getByRole("heading", { level: 3 })).toHaveText([
      articles[1] ?? "",
      articles[0] ?? "",
    ]);
    await expect(
      bestSellers.getByRole("link", { name: /^Ver todo/u })
    ).toHaveCount(0);
    // The banner between rows, with its own words, loads when near.
    const between = store
      .getHomeSection(titles.between)
      .getByRole("link", { name: `${titles.between} Ver todo el catálogo` });
    await expect(between).toHaveAttribute("href", "/productos");
    await expect(between.getByTestId("store-banner-photo")).toHaveAttribute(
      "loading",
      "lazy"
    );

    await row.getByRole("link", { name: articles[0] }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: articles[0] })
    ).toBeVisible();
  });

  test("in English, the same home in the visitor's language, each name in its own", async ({
    db,
    homeEdit,
    page,
  }) => {
    const { articles, shelf, titles } = await curateHome(db, homeEdit);
    const store = new StorePage(page);
    await store.gotoEnglish();

    await expect(store.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    await expect(
      store.getHomeCover().getByRole("link", {
        name: `${titles.coverEn} Shop now`,
      })
    ).toHaveAttribute("href", `/en/${shelf.slug}`);
    expect(await firstHeadings(store, 4)).toEqual([
      titles.rowEn,
      titles.betweenEn,
      "Best sellers",
      // No English name: the Spanish one, marked as Spanish.
      titles.other,
    ]);
    await expect(
      store.getHomeSections().getByRole("heading", { name: titles.other })
    ).toHaveAttribute("lang", "es");
    const row = store.getHomeSection(titles.rowEn);
    await expect(
      row.getByRole("link", { name: `See all: ${titles.rowEn}` })
    ).toHaveAttribute("href", `/en/${shelf.slug}`);
    await expect(row.getByText("UYU 1,290")).toBeVisible();
    // An article with no English title keeps its Spanish one, so marked.
    await expect(row.getByRole("link", { name: articles[0] })).toHaveAttribute(
      "lang",
      "es"
    );
    await expect(
      store.getHomeSection(titles.betweenEn).getByRole("link")
    ).toHaveAttribute("href", "/en/productos");
  });

  test("the cover moves on its own until paused, a dot shows its banner, and a phone gets the phone crop", async ({
    db,
    homeEdit,
    page,
  }) => {
    const { titles } = await curateHome(db, homeEdit);
    await page.setViewportSize({ height: 844, width: 390 });
    const store = new StorePage(page);
    await store.goto();

    const cover = store.getHomeCover();
    const photo = cover
      .getByRole("link", { name: `${titles.cover} Comprar ahora` })
      .getByTestId("store-banner-photo");
    await expect
      .poll(async () => await chosenPhoto(photo))
      .toContain("/seed/ring-3-phone.jpg");

    // WCAG 2.2.2: the pause button stops it and says so. The server's
    // button is not React's until the page hydrates, so it is pressed until
    // it answers, never once it has.
    const pause = cover.getByRole("button", { name: "Pausar la portada" });
    await expect(async () => {
      if ((await pause.getAttribute("aria-pressed")) !== "true") {
        await pause.click();
      }

      await expect(pause).toHaveAttribute("aria-pressed", "true", {
        timeout: 2000,
      });
    }).toPass();
    await pause.click();
    await expect(pause).toHaveAttribute("aria-pressed", "false");

    const second = cover.getByRole("link", {
      name: `${titles.coverTwo} Comprar ahora`,
    });
    await cover.getByRole("button", { name: "Ver la portada 2" }).click();
    await expect(second).toBeInViewport();
    await expect(
      cover.getByRole("button", { name: "Ver la portada 2" })
    ).toHaveAttribute("aria-current", "true");
    await store.expectNoHorizontalScroll();
  });

  test("a row works by keyboard: Tab walks its cards into view and the arrow keys step it", async ({
    db,
    homeEdit,
    page,
  }) => {
    const { articles, titles } = await curateHome(db, homeEdit);
    await page.setViewportSize({ height: 844, width: 390 });
    const store = new StorePage(page);
    await store.goto();

    const row = store.getHomeSection(titles.row);
    const card = (index: number) =>
      row.getByRole("link", { exact: true, name: articles[index] });
    // The round arrow shows once the carousel has measured its cards: the
    // row is React's.
    await expect(
      row.getByRole("button", { name: `Ver más de ${titles.row}` })
    ).toBeVisible();
    await expect(card(2)).not.toBeInViewport();

    await row.getByRole("link", { name: `Ver todo: ${titles.row}` }).focus();
    await page.keyboard.press("Tab");
    await expect(card(0)).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(card(2)).toBeFocused();
    await expect(card(2)).toBeInViewport();

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(card(0)).toBeInViewport();
    await store.expectNoHorizontalScroll();
  });

  // FER-059. An article in the spotlight, right under the cover: the dark
  // block catches the eye as one scrolls; its name, photo and words lead to
  // the article, and its button adds it to the cart.
  test("an article spotlight shows right after the cover in both languages, leads to the article, adds it to the cart, and leaves when the article is unpublished", async ({
    db,
    homeEdit,
    page,
  }) => {
    const tag = uniqueTag();
    const shelf = await db.seed.createCategory({
      nameEs: `Vidriera ${tag}`,
      slug: `vidriera-${tag}`,
    });
    const title = `Burbujero ${tag}`;
    const article = await db.seed.createArticle({
      categoryId: shelf.id,
      priceAmount: 79_000,
      title,
    });
    await homeEdit.addSpotlight(article.id, {
      labelEn: "New",
      labelEs: "Nuevo",
      phraseEs: `El que más piden ${tag}`,
    });
    const store = new StorePage(page);

    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ height, width });
      await store.goto();

      const block = store.getSpotlight(title);
      // Right under the cover: the first of the home's sections.
      await expect(store.getHomeSections().first()).toHaveAttribute(
        "data-kind",
        "spotlight"
      );
      await expect(store.getHomeSections().first()).toContainText(title);
      await expect(
        block.getByRole("heading", { level: 2, name: title })
      ).toBeVisible();
      await expect(block.getByText("Nuevo", { exact: true })).toBeVisible();
      await expect(block.getByText(`El que más piden ${tag}`)).toBeVisible();
      await expect(block.getByRole("link", { name: title })).toHaveAttribute(
        "href",
        `/productos/${article.slug}`
      );
      await store.expectNoHorizontalScroll();

      // A press on the photo is a press on the name's link, stretched over
      // the block: a pointer there, as a finger would, not a click on the
      // img element, which the link covers by design. At both widths: on a
      // computer the photo moves to the right of the words.
      const photo = block.getByRole("img");
      await photo.scrollIntoViewIfNeeded();
      const box = await photo.boundingBox();
      await page.mouse.click((box?.x ?? 0) + 20, (box?.y ?? 0) + 20);
      await expect(page).toHaveURL(
        new RegExp(`/productos/${article.slug}$`, "u")
      );
    }

    // The button adds it and opens the cart's panel on its line.
    await store.goto();
    const add = await store.getLiveSpotlightAdd(title);
    await add.click();
    await expect(store.getCartPanel()).toBeVisible();
    await expect(store.getCartPanelLine(title)).toBeVisible();
    await expect(store.getCartPanel()).toContainText(
      `Agregaste ${title} al carrito.`
    );
    await store.closeCartPanel();
    await expect(add).toBeFocused();

    // In English, its English label, and the Spanish phrase it only has.
    await store.gotoEnglish();
    const english = store.getSpotlight(title);
    await expect(english.getByText("New", { exact: true })).toBeVisible();
    await expect(english.getByText(`El que más piden ${tag}`)).toHaveAttribute(
      "lang",
      "es"
    );
    await expect(english.getByRole("link", { name: title })).toHaveAttribute(
      "href",
      `/en/productos/${article.slug}`
    );
    await expect(
      english.getByRole("button", { name: `Add to cart: ${title}` })
    ).toBeVisible();

    // Unpublished, it leaves the home; saving the order drops the cache.
    await db.drizzle
      .update(product)
      .set({ status: "draft" })
      .where(eq(product.id, article.id));
    const now = await homeEdit.read();
    await homeEdit.saveLayout({
      coverBannerIds: now.coverBannerIds,
      featuredProductIds: now.featuredProductIds,
      rankingProductIds: now.rankingProductIds,
      sections: now.sections,
    });
    await store.goto();
    await expect(store.getHomeView()).toBeVisible();
    await expect(store.getSpotlight(title)).toHaveCount(0);
  });

  test("a crawler that runs no script finds the spotlight's article, words and price in the HTML", async ({
    baseURL,
    browser,
    db,
    homeEdit,
  }) => {
    const tag = uniqueTag();
    const shelf = await db.seed.createCategory({
      nameEs: `Vidriera ${tag}`,
      slug: `vidriera-${tag}`,
    });
    const title = `Burbujero ${tag}`;
    const article = await db.seed.createArticle({
      categoryId: shelf.id,
      priceAmount: 79_000,
      title,
    });
    await homeEdit.addSpotlight(article.id, {
      labelEs: "Nuevo",
      phraseEs: `El que más piden ${tag}`,
    });
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      javaScriptEnabled: false,
      userAgent: BINGBOT,
    });

    try {
      const page = await context.newPage();
      const store = new StorePage(page);
      await store.goto();

      const block = store.getSpotlight(title);
      await expect(
        block.getByRole("heading", { level: 2, name: title })
      ).toBeVisible();
      await expect(block.getByText(`El que más piden ${tag}`)).toBeVisible();
      await expect(block.getByText(/^\$\s790$/u)).toBeVisible();
      await expect(block.getByRole("link", { name: title })).toHaveAttribute(
        "href",
        `/productos/${article.slug}`
      );
    } finally {
      await context.close();
    }
  });

  // A crawler that reads only the HTML (Bingbot) gets only what the server
  // wrote in place (docs/agents/nextjs.md § Store pages): every section must
  // be in the first response, behind no boundary.
  test("a crawler that runs no script finds every section of the home in the HTML", async ({
    baseURL,
    browser,
    db,
    homeEdit,
  }) => {
    const { articles, titles } = await curateHome(db, homeEdit);
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      javaScriptEnabled: false,
      userAgent: BINGBOT,
    });

    try {
      const page = await context.newPage();
      const store = new StorePage(page);
      await store.goto();

      await expect(store.getHeading(1)).toHaveText(STORE_SETTINGS.name);
      await expect(
        store.getHomeCover().getByRole("heading", { name: titles.cover })
      ).toBeVisible();
      // The cover's next banner is in the HTML too, off to the side.
      await expect(
        store.getHomeCover().getByText(titles.coverTwo)
      ).toBeAttached();
      expect(await firstHeadings(store, 4)).toEqual([
        titles.row,
        titles.between,
        "Más vendidos",
        titles.other,
      ]);
      await expect(
        store.getHomeSection(titles.row).getByRole("heading", { level: 3 })
      ).toHaveText(articles);
      await expect(store.getHomeSection(titles.row)).toBeVisible();
      await expect(store.getFooter()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("a store with nothing to show introduces itself instead, in both languages", async ({
    homeEdit,
    page,
  }) => {
    await homeEdit.hideEverything();
    await page.setViewportSize({ height: 844, width: 390 });
    const store = new StorePage(page);
    await store.goto();

    await expect(store.getHomeView()).toHaveAttribute("data-kind", "intro");
    await expect(store.getHomeCover()).toHaveCount(0);
    await expect(store.getHomeSections()).toHaveCount(0);
    await expect(store.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    await expect(store.getHeading(1)).toBeInViewport();
    await expect(
      store.getIntro().getByText(STORE_TEXTS.es.tagline)
    ).toBeVisible();
    await expect(store.getDescription()).toHaveText(STORE_TEXTS.es.description);
    await expect(
      store.getIntro().getByRole("link", { name: "Ver el catálogo" })
    ).toHaveAttribute("href", "/productos");
    await store.expectNoHorizontalScroll();

    await store.gotoEnglish();

    await expect(store.getHomeView()).toHaveAttribute("data-kind", "intro");
    await expect(store.getDescription()).toHaveText(STORE_TEXTS.en.description);
    await expect(
      store.getIntro().getByRole("link", { name: "See the catalog" })
    ).toHaveAttribute("href", "/en/productos");
  });

  // FER-020's acceptance, its storefront half: what the admin sets is what
  // the home shows.
  test("the announcement, a banner and a ranking set in the admin all show on the home", async ({
    db,
    homeEdit: _restoresTheHome,
    page,
  }) => {
    test.slow();
    await interceptBlobStore(page);
    const tag = uniqueTag();
    const shelf = await db.seed.createCategory({
      nameEs: `Ranking ${tag}`,
      slug: `ranking-${tag}`,
    });
    const titles = {
      banner: `Banner ${tag}`,
      bubbles: `Burbujero ${tag}`,
      ring: `Anillo ${tag}`,
      soldOut: `Agotado ${tag}`,
    };
    await db.seed.createArticle({
      categoryId: shelf.id,
      priceAmount: 1290,
      title: titles.ring,
    });
    await db.seed.createArticle({
      categoryId: shelf.id,
      priceAmount: 990,
      title: titles.bubbles,
    });
    await db.seed.createArticle({
      categoryId: shelf.id,
      isAvailable: false,
      priceAmount: 590,
      title: titles.soldOut,
    });
    const text = `Feria ${tag}`;
    const home = new AdminHomePage(page);
    await home.open();

    await home.announcementField("Texto en español").fill(text);
    await home.saveAnnouncement({ textEs: text });

    await home.openNewBanner();
    const form = home.bannerForm();
    const computer = form.getByRole("group", { name: "Foto para computadora" });
    await computer
      .getByTestId("image-uploader-input")
      .setInputFiles(seedPhoto("bubbles-1.jpg"));
    await expect(computer.getByRole("status")).toHaveText("Foto subida.");
    await form
      .getByRole("textbox", { exact: true, name: "Título en español" })
      .fill(titles.banner);
    // In the cover, where a new banner goes by default.
    await home.saveNewBanner({ placement: "cover", titleEs: titles.banner });
    await expectDialogRemoved(page, form);

    await home.clearBestSellers();
    await home.addBestSeller(titles.bubbles);
    await home.addBestSeller(titles.soldOut);
    await home.addBestSeller(titles.ring);
    await home.saveOrder();

    const store = new StorePage(page);
    await store.goto();

    await expect(store.getAnnouncementFull()).toHaveText(text);
    await expect(
      store.getHomeCover().getByText(titles.banner, { exact: true })
    ).toBeAttached();
    // What can be bought, in the order ranked: the sold-out one drops out.
    await expect(
      store.getHomeSection("Más vendidos").getByRole("heading", { level: 3 })
    ).toHaveText([titles.bubbles, titles.ring]);
  });
});
